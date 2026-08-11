(function() {
    // ── Auth check ──
    if (!Auth.isLoggedIn()) { location.href = 'login.html?return=' + encodeURIComponent('recipe-editor.html' + location.search); return; }
    var user = Auth.getUser();
    if (!user || user.role !== 'admin') { alert('Нет прав администратора'); location.href = 'index.html'; return; }

    // Keep token alive — without this the access token expires after ~15 min and saves fail with 401
    Auth.startAutoRefresh();

    // ── API helper ──
    function api(path, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        var _doFetch = function() {
            opts.headers['Authorization'] = 'Bearer ' + Auth.getToken();
            return fetch(API_BASE + path, opts).then(function(res) {
                if (res.status === 401) {
                    return Auth.refreshToken().then(function(ok) {
                        if (ok) {
                            opts.headers['Authorization'] = 'Bearer ' + Auth.getToken();
                            return fetch(API_BASE + path, opts).then(function(r2) {
                                if (r2.status === 401) { location.href = 'login.html?return=' + encodeURIComponent('recipe-editor.html' + location.search); }
                                if (r2.status === 403) { showToast('Нет прав администратора', true); throw new Error('403'); }
                                if (r2.status === 429) { showToast('Слишком много запросов, подождите', true); throw new Error('429'); }
                                return r2.json();
                            });
                        }
                        location.href = 'login.html?return=' + encodeURIComponent('recipe-editor.html' + location.search);
                    });
                }
                if (res.status === 403) { showToast('Нет прав администратора', true); throw new Error('403'); }
                if (res.status === 429) { showToast('Слишком много запросов, подождите', true); throw new Error('429'); }
                return res.json();
            });
        };
        if (opts.body && typeof opts.body === 'object') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        if (!Auth.getToken()) {
            return Auth.refreshToken().then(function() { return _doFetch(); });
        }
        return _doFetch();
    }

    // ── Toast ──
    var toastTimeout;
    function showToast(msg, isError) {
        var el = document.getElementById('re-toast');
        el.textContent = msg;
        el.className = 're-toast show' + (isError ? ' error' : '');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(function() { el.classList.remove('show'); }, 3000);
    }

    // ── State ──
    var editId = null;
    var originalRecipe = null;
    var isCreateMode = false;

    var params = new URLSearchParams(window.location.search);
    editId = params.get('id') || null;

    var allCategoriesEditor = [];
    var selectedCategoryOrder = [];
    function syncSoupFlagFromCategories() {
        var soupFlag = document.getElementById('re-is-soup');
        if (!soupFlag) return;
        var byCategory = selectedCategoryOrder.indexOf('soups') !== -1;
        if (byCategory) soupFlag.checked = true;
        soupFlag.disabled = byCategory;
    }

    function populateCategoryUI() {
        // Categories stay checkbox-only in UI; we preserve the primary category via selectedCategoryOrder[0].
        var catBox = document.getElementById('re-cat');
        catBox.innerHTML = allCategoriesEditor.map(function(c) {
            return '<label class="re-cat-row" data-cat="' + c.id + '" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:13px;padding:2px 8px;border-radius:6px;border:1px solid transparent">' +
                '<input type="checkbox" value="' + c.id + '" data-role="member"> ' +
                '<span>' + esc(c.name) + '</span>' +
            '</label>';
        }).join('');
        // Auto-addons selects
        ['protein', 'fat', 'carbs', 'fiber'].forEach(function(s) {
            var el = document.getElementById('re-aa-' + s);
            if (!el) return;
            var opts = '<option value="">— нет —</option>';
            allCategoriesEditor.forEach(function(c) {
                opts += '<option value="' + c.id + '">' + esc(c.name) + '</option>';
            });
            el.innerHTML = opts;
        });
        refreshCategoryRowState();
    }

    // Highlight the category that will stay primary on save.
    function refreshCategoryRowState() {
        var rows = document.querySelectorAll('#re-cat .re-cat-row');
        var checked = Array.prototype.map.call(
            document.querySelectorAll('#re-cat input[data-role=member]:checked'),
            function(chk) { return chk.value; }
        );
        selectedCategoryOrder = selectedCategoryOrder.filter(function(id) {
            return checked.indexOf(id) !== -1;
        });
        checked.forEach(function(id) {
            if (selectedCategoryOrder.indexOf(id) === -1) selectedCategoryOrder.push(id);
        });
        var primary = selectedCategoryOrder[0] || null;
        rows.forEach(function(row) {
            var chk = row.querySelector('input[data-role=member]');
            if (chk.checked && chk.value === primary) {
                row.style.background = 'rgba(232, 64, 10, 0.08)';
                row.style.borderColor = 'var(--accent, #e8400a)';
            } else {
                row.style.background = '';
                row.style.borderColor = 'transparent';
            }
        });
        syncSoupFlagFromCategories();
    }

    Promise.all([
        fetch(API_BASE + '/content/categories').then(function(r) { return r.json(); }),
        fetch(API_BASE + '/content/ingredients').then(function(r) { return r.json(); }).catch(function() { return []; })
    ]).then(function(result) {
        allCategoriesEditor = result[0] || [];
        if (window.SP_INGREDIENTS && typeof SP_INGREDIENTS.addIngredients === 'function') {
            SP_INGREDIENTS.addIngredients(result[1] || []);
        }
        populateCategoryUI();
        populateMainIngredientGroupSelect();
    }).catch(function() {}).finally(function() {
        if (editId) {
            loadRecipe(editId);
        } else {
            isCreateMode = true;
            document.getElementById('loading').style.display = 'none';
            document.getElementById('editor-content').style.display = 'block';
            document.getElementById('recipe-header').textContent = 'Новый рецепт';
            document.getElementById('create-hint').style.display = 'block';
            document.getElementById('re-published').checked = false;
            renderMainIngredients([]);  // пустые чекбоксы выборок для нового рецепта
            updateStatusBadge();
            checkForDraft();
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // SLUG GENERATION (transliteration)
    // ══════════════════════════════════════════════════════════════════════

    var TRANSLIT = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
        'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
        'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y',
        'ь':'','э':'e','ю':'yu','я':'ya'
    };

    function slugify(str) {
        return str.toLowerCase().split('').map(function(ch) {
            if (TRANSLIT[ch] !== undefined) return TRANSLIT[ch];
            if (/[a-z0-9]/.test(ch)) return ch;
            if (/[\s\-_.,/\\]/.test(ch)) return '-';
            return '';
        }).join('').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
    }

    window.generateSlug = function() {
        var name = document.getElementById('re-name').value.trim();
        if (!name) { showToast('Сначала введите название', true); return; }
        var slug = slugify(name);
        if (!slug) { showToast('Не удалось сгенерировать slug', true); return; }
        document.getElementById('re-id').value = slug;
        clearError('re-id');
    };

    // Auto-generate slug as user types name (only in create mode, if slug is empty)
    document.getElementById('re-name').addEventListener('input', function() {
        if (isCreateMode && !editId) {
            var idField = document.getElementById('re-id');
            var currentSlug = idField.value;
            var prevName = idField.getAttribute('data-auto-source') || '';
            // Auto-fill only if slug is empty or was auto-generated from previous name
            if (!currentSlug || currentSlug === slugify(prevName)) {
                var newSlug = slugify(this.value.trim());
                idField.value = newSlug;
                idField.setAttribute('data-auto-source', this.value.trim());
            }
        }
    });

    (function wireMainIngredientSlug() {
        var nameEl = document.getElementById('re-mi-name');
        var idEl = document.getElementById('re-mi-id');
        if (!nameEl || !idEl) return;
        nameEl.addEventListener('input', function() {
            if (idEl.value.trim()) return;
            idEl.value = slugify(nameEl.value).substring(0, 50);
        });
    })();

    // ══════════════════════════════════════════════════════════════════════
    // STATUS BADGE
    // ══════════════════════════════════════════════════════════════════════

    function updateStatusBadge() {
        var isPublished = document.getElementById('re-published').checked;
        var header = document.getElementById('recipe-header');
        var existing = header.querySelector('.re-status-badge');
        if (existing) existing.remove();
        var badge = document.createElement('span');
        badge.className = 're-status-badge ' + (isPublished ? 'published' : 'draft');
        badge.innerHTML = '<span class="re-status-dot"></span>' + (isPublished ? 'Опубликован' : 'Черновик');
        header.appendChild(badge);
    }

    document.getElementById('re-published').addEventListener('change', updateStatusBadge);

    // ══════════════════════════════════════════════════════════════════════
    // SECTION COUNTS
    // ══════════════════════════════════════════════════════════════════════

    function updateCounts() {
        var ic = document.getElementById('re-ingredients-list').children.length;
        document.getElementById('count-ingredients').textContent = ic ? '(' + ic + ')' : '';
        var sc = document.getElementById('re-steps-list').children.length;
        document.getElementById('count-steps').textContent = sc ? '(' + sc + ')' : '';
    }

    // ══════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ══════════════════════════════════════════════════════════════════════

    function getCategories() {
        // Returns [primary, ...others] while UI stays checkbox-only.
        refreshCategoryRowState();
        return selectedCategoryOrder.slice();
    }
    function setCategories(arr) {
        selectedCategoryOrder = Array.isArray(arr) ? arr.slice() : [];
        var rows = document.querySelectorAll('#re-cat .re-cat-row');
        rows.forEach(function(row) {
            var chk = row.querySelector('input[data-role=member]');
            var isMember = arr && arr.indexOf(chk.value) !== -1;
            chk.checked = isMember;
        });
        refreshCategoryRowState();
        syncSoupFlagFromCategories();
    }

    function clearError(id) {
        var el = document.getElementById(id);
        el.classList.remove('re-error');
        var msg = el.parentNode.querySelector('.re-error-msg');
        if (msg) msg.remove();
    }

    function setError(id, message) {
        var el = document.getElementById(id);
        el.classList.add('re-error');
        var existing = el.parentNode.querySelector('.re-error-msg');
        if (existing) existing.remove();
        var msg = document.createElement('div');
        msg.className = 're-error-msg';
        msg.textContent = message;
        el.parentNode.appendChild(msg);
        return false;
    }

    function validateForm(body) {
        var valid = true;
        // Clear all errors
        document.querySelectorAll('.re-error').forEach(function(el) { el.classList.remove('re-error'); });
        document.querySelectorAll('.re-error-msg').forEach(function(el) { el.remove(); });

        if (!body.name) { setError('re-name', 'Название обязательно'); valid = false; }
        if (!body.id) {
            setError('re-id', 'ID обязателен');
            valid = false;
        } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(body.id) && body.id.length > 1) {
            setError('re-id', 'Только латиница, цифры и дефис');
            valid = false;
        } else if (body.id.length < 2) {
            setError('re-id', 'Минимум 2 символа');
            valid = false;
        }
        if (!body.categories || !body.categories.length) { setError('re-cat', 'Выберите хотя бы одну категорию'); valid = false; }

        if (!valid) {
            // Scroll to first error
            var firstErr = document.querySelector('.re-error');
            if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return valid;
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOAD / POPULATE
    // ══════════════════════════════════════════════════════════════════════

    function loadRecipe(id) {
        api('/admin/recipes').then(function(data) {
            var recipe = null;
            for (var i = 0; i < data.length; i++) {
                if (data[i].id === id) { recipe = data[i]; break; }
            }
            if (!recipe) {
                showToast('Рецепт не найден', true);
                document.getElementById('loading').textContent = 'Рецепт «' + id + '» не найден';
                return;
            }
            originalRecipe = recipe;
            populateForm(recipe);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('editor-content').style.display = 'block';
        }).catch(function() {
            showToast('Ошибка загрузки', true);
        });
    }

    function populateForm(r) {
        document.getElementById('recipe-header').innerHTML =
            esc(r.emoji || '') + ' ' + esc(r.name) + ' <em>(' + esc(r.id) + ')</em>';

        document.getElementById('re-id').value = r.id;
        document.getElementById('re-id').disabled = true;
        document.getElementById('btn-gen-slug').style.display = 'none';
        setCategories(r.categories || (r.cat ? [r.cat] : []));
        document.getElementById('re-name').value = r.name;
        document.getElementById('re-emoji').value = r.emoji || '🍴';
        document.getElementById('re-time').value = r.time_min || 30;
        document.getElementById('re-time-label').value = r.time_label || '';
        document.getElementById('re-diff').value = r.difficulty || 'easy';
        document.getElementById('re-servings').value = r.servings || 4;
        document.getElementById('re-portion-grams').value = r.portion_grams || 300;
        document.getElementById('re-sort-order').value = r.sort_order || 0;
        document.getElementById('re-published').checked = r.is_published;
        document.getElementById('re-free').checked = r.is_free;
        const _alSel = document.getElementById('re-access-level');
        if (_alSel) _alSel.value = r.access_level || (r.is_free ? 'free' : 'pro');
        document.getElementById('re-is-soup').checked = !!r.is_soup || getCategories().indexOf('soups') !== -1;
        syncSoupFlagFromCategories();
        document.getElementById('re-photo').value = r.photo || '';
        document.getElementById('re-img-position').value = r.img_position || '';
        document.getElementById('re-quote').value = r.quote || '';
        document.getElementById('re-note').value = r.note || '';
        document.getElementById('re-tags').value = (r.tags || []).join(', ');
        setRecipeDietaryFlags(r.dietary_flags || []);
        document.getElementById('re-dietary-verified').checked = r.dietary_verified === true;
        document.getElementById('re-yt-video').value = r.yt_video || '';
        document.getElementById('re-vk-video').value = r.vk_video || '';
        document.getElementById('re-dzen-video').value = r.dzen_video || '';

        document.getElementById('re-kcal').value = r.kcal || 0;
        document.getElementById('re-protein').value = r.protein || 0;
        document.getElementById('re-fat').value = r.fat || 0;
        document.getElementById('re-carbs').value = r.carbs || 0;
        document.getElementById('re-fiber').value = r.fiber || 0;
        updateKbzhuBar();

        // Ingredients
        var ingr = r.ingredients || [];
        ingr.forEach(function(item) {
            if (typeof item === 'string') item = { name: item, swap: null };
            addIngredient(item.name || '', item.swap || '', item.omit_nutrition || nutritionDeltaToPositive(item.omit_delta) || null, item.omit_hint || '', item.dietary_flags || [], item.swap_options || [], item.swap_nutrition || null, item.omit || '');
        });
        syncRecipeDietaryFlagsFromIngredients();

        // Steps
        var steps = r.steps || [];
        steps.forEach(function(s) {
            if (typeof s === 'string') {
                addStep(s, '');
            } else {
                addStep(s.text || '', s.photo || '');
            }
        });

        // Add-panels
        populateAddPanel('protein', r.add_protein);
        populateAddPanel('fat', r.add_fat);
        populateAddPanel('carbs', r.add_carbs);
        populateAddPanel('fiber', r.add_fiber);

        // Основные ингредиенты для выборок (snake_case из API)
        renderMainIngredients(r.main_ingredients || []);

        // Auto-addons
        var aa = r.auto_addons || {};
        window._lastLoadedAutoAddons = aa;
        ['protein', 'fat', 'carbs', 'fiber'].forEach(function(s) {
            var rule = aa[s] || {};
            var el = document.getElementById('re-aa-' + s);
            if (el) el.value = rule.fromCategory || '';
        });

        updatePhotoPreview();
        updateStatusBadge();
        updateCounts();
        // Save baseline so autosave can detect real changes
        lastSavedJson = JSON.stringify(collectFormData());
        checkForDraft();
    }

    function populateAddPanel(type, items) {
        if (!items || !items.length) return;
        items.forEach(function(it) {
            if (typeof it === 'string') it = { name: it };
            addAddItem(type, it.name || '', it.kcal || 0, it.protein || 0, it.fat || 0, it.carbs || 0, it.fiber || 0, it.recipeId || '');
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // INGREDIENTS — repeatable rows
    // ══════════════════════════════════════════════════════════════════════

    function normalizeNutritionForEditor(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            kcal: Number(raw.kcal) || 0,
            protein: Number(raw.protein) || 0,
            fat: Number(raw.fat) || 0,
            carbs: Number(raw.carbs) || 0,
            fiber: Number(raw.fiber) || 0
        };
    }

    function nutritionDeltaToPositive(raw) {
        var n = normalizeNutritionForEditor(raw);
        if (!n) return null;
        return {
            kcal: Math.abs(n.kcal),
            protein: Math.abs(n.protein),
            fat: Math.abs(n.fat),
            carbs: Math.abs(n.carbs),
            fiber: Math.abs(n.fiber)
        };
    }

    function nutritionToNegativeDelta(raw) {
        var n = normalizeNutritionForEditor(raw) || { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
        return {
            kcal: -Math.abs(n.kcal),
            protein: -Math.abs(n.protein),
            fat: -Math.abs(n.fat),
            carbs: -Math.abs(n.carbs),
            fiber: -Math.abs(n.fiber)
        };
    }

    function normalizeSwapNutritionForEditor(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var original = normalizeNutritionForEditor(raw.original);
        var replacement = normalizeNutritionForEditor(raw.replacement);
        var replacements = Array.isArray(raw.replacements) ? raw.replacements.map(function(item) {
            if (!item || typeof item !== 'object') return null;
            var nutrition = normalizeNutritionForEditor(item.nutrition || item.replacement || item);
            if (!nutrition) return null;
            return {
                name: (typeof item.name === 'string' ? item.name : '').trim(),
                nutrition: nutrition
            };
        }).filter(Boolean) : [];
        if (!original && !replacement && !replacements.length) return null;
        return {
            original: original || { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
            replacement: replacement || (replacements[0] ? replacements[0].nutrition : { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }),
            replacements: replacements
        };
    }

    function splitSwapAlternativesForEditor(text) {
        if (!text) return [];
        var parts = [];
        var depth = 0;
        var buf = '';
        var i = 0;
        while (i < text.length) {
            var ch = text[i];
            if (ch === '(') { depth++; buf += ch; i++; continue; }
            if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; i++; continue; }
            if (depth === 0) {
                if ((ch === ',' && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) || ch === ';' || ch === '/') {
                    if (buf.trim()) parts.push(buf.trim());
                    buf = '';
                    i++;
                    continue;
                }
                var orMatch = text.substr(i).match(/^\s+или\s+/i);
                if (orMatch) {
                    if (buf.trim()) parts.push(buf.trim());
                    buf = '';
                    i += orMatch[0].length;
                    continue;
                }
            }
            buf += ch;
            i++;
        }
        if (buf.trim()) parts.push(buf.trim());
        return parts;
    }

    function findSwapReplacementNutrition(swapNutrition, name, index) {
        if (!swapNutrition) return null;
        var list = Array.isArray(swapNutrition.replacements) ? swapNutrition.replacements : [];
        var norm = (name || '').trim().toLowerCase();
        for (var i = 0; i < list.length; i++) {
            if ((list[i].name || '').trim().toLowerCase() === norm) return list[i].nutrition;
        }
        if (list[index]) return list[index].nutrition;
        if (index === 0) return swapNutrition.replacement;
        return null;
    }

    function renderSwapReplacementNutritionRows(item, swapNutrition) {
        if (!item) return;
        var swapInput = item.querySelector('[data-field="swap"]');
        var omitInput = item.querySelector('[data-field="omit"]');
        var singleLabel = item.querySelector('[data-role="swap-replacement-single-label"]');
        var singleGrid = item.querySelector('[data-role="swap-replacement-single-grid"]');
        var multiBox = item.querySelector('[data-role="swap-replacements-box"]');
        if (!swapInput || !singleLabel || !singleGrid || !multiBox) return;
        var parts = splitSwapAlternativesForEditor(swapInput.value || '');
        var useMulti = parts.length > 1;
        singleLabel.style.display = useMulti ? 'none' : '';
        singleGrid.style.display = useMulti ? 'none' : '';
        multiBox.style.display = useMulti ? '' : 'none';
        if (!useMulti) {
            multiBox.innerHTML = '';
            return;
        }
        multiBox.innerHTML = parts.map(function(part, index) {
            var n = findSwapReplacementNutrition(swapNutrition, part, index) || { kcal: '', protein: '', fat: '', carbs: '', fiber: '' };
            return '<div class="re-item-label-inline" style="margin-top:8px">' + esc(part) + '</div>' +
                '<div class="re-ingredient-omit-grid" data-role="swap-replacement-row" data-name="' + escAttr(part) + '">' +
                    '<input class="re-input" data-role="swap-replacement-kcal" type="number" step="1" placeholder="ккал" value="' + escAttr(n.kcal) + '">' +
                    '<input class="re-input" data-role="swap-replacement-protein" type="number" step="0.1" placeholder="Б" value="' + escAttr(n.protein) + '">' +
                    '<input class="re-input" data-role="swap-replacement-fat" type="number" step="0.1" placeholder="Ж" value="' + escAttr(n.fat) + '">' +
                    '<input class="re-input" data-role="swap-replacement-carbs" type="number" step="0.1" placeholder="У" value="' + escAttr(n.carbs) + '">' +
                    '<input class="re-input" data-role="swap-replacement-fiber" type="number" step="0.1" placeholder="Кл" value="' + escAttr(n.fiber) + '">' +
                '</div>';
        }).join('');
    }

    function isOptionalSwapText(text) {
        if (typeof text !== 'string') return false;
        var norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!norm) return false;
        return /^можно без (?:не(?:го|ё|е)|них)(?:[\s.,!;:—-].*)?$/.test(norm);
    }

    function refreshIngredientOptionalUi(item) {
        if (!item) return;
        var swapInput = item.querySelector('[data-field="swap"]');
        var omitInput = item.querySelector('[data-field="omit"]');
        var omitBox = item.querySelector('[data-role="omit-box"]');
        var omitToggle = item.querySelector('[data-role="omit-toggle"]');
        var hintBox = item.querySelector('[data-role="omit-hint-box"]');
        var swapNutritionBox = item.querySelector('[data-role="swap-nutrition-box"]');
        var swapNutritionToggle = item.querySelector('[data-role="swap-nutrition-toggle"]');
        if (!swapInput || !omitBox || !omitToggle) return;
        var enabled = !!(omitInput && omitInput.value.trim()) || isOptionalSwapText(swapInput.value || '');
        omitBox.classList.toggle('open', enabled);
        omitToggle.disabled = !enabled;
        if (!enabled) omitToggle.checked = false;
        if (hintBox) {
            hintBox.classList.toggle('open', enabled);
        }
        var replacementEnabled = !!(swapInput.value || '').trim() && !isOptionalSwapText(swapInput.value || '');
        if (swapNutritionBox) swapNutritionBox.classList.toggle('open', replacementEnabled);
        if (swapNutritionToggle) {
            swapNutritionToggle.disabled = !replacementEnabled;
            if (!replacementEnabled) swapNutritionToggle.checked = false;
        }
    }

    window.addIngredient = function(name, swap, omitNutrition, omitHint, dietaryFlags, swapOptions, swapNutrition, omitText) {
        name = name || '';
        swap = swap || '';
        omitText = omitText || '';
        if (!omitText && isOptionalSwapText(swap)) {
            omitText = swap;
            swap = '';
        }
        omitNutrition = nutritionDeltaToPositive(omitNutrition);
        swapNutrition = normalizeSwapNutritionForEditor(swapNutrition);
        omitHint = (typeof omitHint === 'string' ? omitHint : '').trim();
        var initialDietaryFlags = normalizeEditorDietaryFlags(dietaryFlags);
        var initialSwapOptions = normalizeEditorDietarySwapOptions(swapOptions);
        var initialSwapOptionNames = initialSwapOptions.map(function(option) { return option.name; }).join('; ');
        var list = document.getElementById('re-ingredients-list');
        var item = document.createElement('div');
        item.className = 're-list-item';
        item.draggable = true;
        item.innerHTML =
            '<span class="re-drag" title="Перетащить">⠿</span>' +
            '<div class="re-item-fields">' +
                '<div class="re-item-row">' +
                    '<input class="re-item-input" data-field="name" placeholder="Название ингредиента" value="' + escAttr(name) + '">' +
                '</div>' +
                '<div class="re-item-row">' +
                    '<span class="re-item-label-inline">Замена</span>' +
                    '<input class="re-item-input" data-field="swap" placeholder="Чем заменить (необязательно)" value="' + escAttr(swap) + '">' +
                '</div>' +
                '<div class="re-item-row">' +
                    '<span class="re-item-label-inline">Исключение</span>' +
                    '<input class="re-item-input" data-field="omit" placeholder="Напр.: Можно без него" value="' + escAttr(omitText) + '">' +
                '</div>' +
                '<div class="re-item-row">' +
                    '<span class="re-item-label-inline">Диета</span>' +
                    '<div class="re-inline-dietary-checks" data-role="ingredient-dietary-checks">' +
                        editorDietaryChecksHtml('ingredient', initialDietaryFlags) +
                    '</div>' +
                '</div>' +
                '<div class="re-item-row">' +
                    '<span class="re-item-label-inline">Замены для фильтра</span>' +
                    '<div class="re-swap-dietary-fields">' +
                        '<input class="re-item-input" data-field="swap_options" placeholder="Соус из кешью; Соус из фасоли" value="' + escAttr(initialSwapOptionNames) + '">' +
                        '<div class="re-swap-dietary-options" data-role="swap-dietary-options"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="re-ingredient-omit-box" data-role="swap-nutrition-box">' +
                    '<label class="re-ingredient-omit-toggle">' +
                        '<input type="checkbox" data-role="swap-nutrition-toggle"' + (swapNutrition ? ' checked' : '') + '>' +
                        '<span>Замена меняет КБЖУ</span>' +
                    '</label>' +
                    '<div class="re-hint">Укажите КБЖУ заменяемого и нового ингредиента. Карточка сама вычтет старый и добавит новый.</div>' +
                    '<div class="re-item-label-inline" style="margin-top:8px">Заменяемый</div>' +
                    '<div class="re-ingredient-omit-grid">' +
                        '<input class="re-input" data-role="swap-original-kcal" type="number" step="1" placeholder="ккал" value="' + (swapNutrition ? swapNutrition.original.kcal : '') + '">' +
                        '<input class="re-input" data-role="swap-original-protein" type="number" step="0.1" placeholder="Б" value="' + (swapNutrition ? swapNutrition.original.protein : '') + '">' +
                        '<input class="re-input" data-role="swap-original-fat" type="number" step="0.1" placeholder="Ж" value="' + (swapNutrition ? swapNutrition.original.fat : '') + '">' +
                        '<input class="re-input" data-role="swap-original-carbs" type="number" step="0.1" placeholder="У" value="' + (swapNutrition ? swapNutrition.original.carbs : '') + '">' +
                        '<input class="re-input" data-role="swap-original-fiber" type="number" step="0.1" placeholder="Кл" value="' + (swapNutrition ? swapNutrition.original.fiber : '') + '">' +
                    '</div>' +
                    '<div class="re-item-label-inline" style="margin-top:8px" data-role="swap-replacement-single-label">Замена</div>' +
                    '<div class="re-ingredient-omit-grid" data-role="swap-replacement-single-grid">' +
                        '<input class="re-input" data-role="swap-replacement-kcal" type="number" step="1" placeholder="ккал" value="' + (swapNutrition ? swapNutrition.replacement.kcal : '') + '">' +
                        '<input class="re-input" data-role="swap-replacement-protein" type="number" step="0.1" placeholder="Б" value="' + (swapNutrition ? swapNutrition.replacement.protein : '') + '">' +
                        '<input class="re-input" data-role="swap-replacement-fat" type="number" step="0.1" placeholder="Ж" value="' + (swapNutrition ? swapNutrition.replacement.fat : '') + '">' +
                        '<input class="re-input" data-role="swap-replacement-carbs" type="number" step="0.1" placeholder="У" value="' + (swapNutrition ? swapNutrition.replacement.carbs : '') + '">' +
                        '<input class="re-input" data-role="swap-replacement-fiber" type="number" step="0.1" placeholder="Кл" value="' + (swapNutrition ? swapNutrition.replacement.fiber : '') + '">' +
                    '</div>' +
                    '<div data-role="swap-replacements-box"></div>' +
                '</div>' +
                '<div class="re-ingredient-omit-box" data-role="omit-box">' +
                    '<label class="re-ingredient-omit-toggle">' +
                        '<input type="checkbox" data-role="omit-toggle"' + (omitNutrition ? ' checked' : '') + '>' +
                        '<span>Исключаемый ингредиент меняет КБЖУ</span>' +
                    '</label>' +
                    '<div class="re-ingredient-omit-grid">' +
                        '<input class="re-input" data-role="omit-kcal" type="number" step="1" placeholder="ккал" value="' + (omitNutrition ? omitNutrition.kcal : '') + '">' +
                        '<input class="re-input" data-role="omit-protein" type="number" step="0.1" placeholder="Б" value="' + (omitNutrition ? omitNutrition.protein : '') + '">' +
                        '<input class="re-input" data-role="omit-fat" type="number" step="0.1" placeholder="Ж" value="' + (omitNutrition ? omitNutrition.fat : '') + '">' +
                        '<input class="re-input" data-role="omit-carbs" type="number" step="0.1" placeholder="У" value="' + (omitNutrition ? omitNutrition.carbs : '') + '">' +
                        '<input class="re-input" data-role="omit-fiber" type="number" step="0.1" placeholder="Кл" value="' + (omitNutrition ? omitNutrition.fiber : '') + '">' +
                    '</div>' +
                    '<div class="re-hint">Укажите КБЖУ самого исключаемого ингредиента положительными числами. Карточка сама вычтет их из КБЖУ рецепта.</div>' +
                '</div>' +
                '<div class="re-ingredient-omit-box" data-role="omit-hint-box">' +
                    '<div class="re-item-row">' +
                        '<span class="re-item-label-inline">Подсказка по шагам при исключении</span>' +
                        '<input class="re-item-input" data-field="omit_hint" placeholder="Напр.: Если без лука и масла, пропустите шаги 2–3" value="' + escAttr(omitHint) + '">' +
                    '</div>' +
                    '<div class="re-hint">Текст увидит пользователь над блоком шагов, если исключит этот ингредиент. Шаги автоматически не переписываются.</div>' +
                '</div>' +
            '</div>' +
            '<button class="re-item-remove" data-editor-template-action="remove-item" title="Удалить">&times;</button>';
        list.appendChild(item);
        var swapInput = item.querySelector('[data-field="swap"]');
        if (swapInput) {
            swapInput.addEventListener('input', function() {
                refreshIngredientOptionalUi(item);
                renderSwapReplacementNutritionRows(item, null);
            });
            swapInput.addEventListener('change', function() {
                refreshIngredientOptionalUi(item);
                renderSwapReplacementNutritionRows(item, null);
            });
        }
        var omitInput = item.querySelector('[data-field="omit"]');
        if (omitInput) {
            omitInput.addEventListener('input', function() { refreshIngredientOptionalUi(item); });
            omitInput.addEventListener('change', function() { refreshIngredientOptionalUi(item); });
        }
        item.querySelectorAll('[data-ingredient-dietary-flag]').forEach(function(input) {
            input.addEventListener('change', syncRecipeDietaryFlagsFromIngredients);
        });
        var swapOptionsInput = item.querySelector('[data-field="swap_options"]');
        if (swapOptionsInput) {
            swapOptionsInput.addEventListener('input', function() { renderSwapDietaryOptions(item); });
            swapOptionsInput.addEventListener('change', function() { renderSwapDietaryOptions(item); });
        }
        renderSwapDietaryOptions(item, initialSwapOptions);
        initDrag(item, list);
        renderSwapReplacementNutritionRows(item, swapNutrition);
        refreshIngredientOptionalUi(item);
        updateCounts();
    };

    // ══════════════════════════════════════════════════════════════════════
    // STEPS — repeatable rows
    // ══════════════════════════════════════════════════════════════════════

    function formatStepPhotoForEditor(photo) {
        if (photo === true) return 'true';
        if (Array.isArray(photo)) {
            return photo.filter(function(p) {
                return typeof p === 'string' && p.trim();
            }).join('\n');
        }
        return photo || '';
    }

    function normalizeStepPhotoForSave(raw) {
        var text = String(raw || '').trim();
        if (!text) return null;
        if (text === 'true') return true;
        if (text.charAt(0) === '[') {
            try {
                var parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    var arr = parsed.filter(function(p) {
                        return typeof p === 'string' && p.trim();
                    }).map(function(p) { return p.trim(); });
                    if (arr.length > 1) return arr;
                    if (arr.length === 1) return arr[0];
                }
            } catch (e) {}
        }
        var lines = text.split(/\r?\n/).map(function(p) {
            return p.trim();
        }).filter(Boolean);
        if (lines.length > 1) return lines;
        return lines[0] || null;
    }

    window.addStep = function(text, photo) {
        text = text || '';
        photo = formatStepPhotoForEditor(photo);
        var list = document.getElementById('re-steps-list');
        var num = list.children.length + 1;
        var item = document.createElement('div');
        item.className = 're-list-item';
        item.draggable = true;
        item.innerHTML =
            '<span class="re-drag" title="Перетащить">⠿</span>' +
            '<span class="re-step-num">' + num + '</span>' +
            '<div class="re-item-fields">' +
                '<textarea class="re-item-textarea" data-field="text" rows="2" placeholder="Описание шага">' + esc(text) + '</textarea>' +
                '<div class="re-item-row">' +
                    '<span class="re-item-label-inline">Фото</span>' +
                    '<textarea class="re-item-textarea" data-field="photo" rows="2" placeholder="Один URL или несколько URL по одному в строке">' + esc(photo) + '</textarea>' +
                '</div>' +
            '</div>' +
            '<button class="re-item-remove" data-editor-template-action="remove-item" title="Удалить">&times;</button>';
        list.appendChild(item);
        initDrag(item, list);
        updateCounts();
    };

    function renumberSteps() {
        var items = document.getElementById('re-steps-list').children;
        for (var i = 0; i < items.length; i++) {
            var badge = items[i].querySelector('.re-step-num');
            if (badge) badge.textContent = i + 1;
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ADD-PANELS — repeatable rows with КБЖУ fields
    // ══════════════════════════════════════════════════════════════════════

    window.addAddItem = function(type, name, kcal, protein, fat, carbs, fiber, recipeId) {
        name = name || '';
        kcal = kcal || 0;
        protein = protein || 0;
        fat = fat || 0;
        carbs = carbs || 0;
        fiber = fiber || 0;
        recipeId = recipeId || '';
        var list = document.getElementById('re-add-' + type + '-list');
        var item = document.createElement('div');
        item.className = 're-list-item';
        item.draggable = true;
        item.innerHTML =
            '<span class="re-drag" title="Перетащить">⠿</span>' +
            '<div class="re-item-fields">' +
                '<div class="re-item-row">' +
                    '<input class="re-item-input" data-field="name" placeholder="Название, напр. Нут отварной (3 ст.л.)" value="' + escAttr(name) + '">' +
                '</div>' +
                '<div class="re-item-row">' +
                    '<input class="re-item-input re-input-sm" data-field="kcal" type="number" placeholder="ккал" value="' + kcal + '" title="Ккал">' +
                    '<input class="re-item-input re-input-sm" data-field="protein" type="number" step="0.1" placeholder="Б" value="' + protein + '" title="Белки">' +
                    '<input class="re-item-input re-input-sm" data-field="fat" type="number" step="0.1" placeholder="Ж" value="' + fat + '" title="Жиры">' +
                    '<input class="re-item-input re-input-sm" data-field="carbs" type="number" step="0.1" placeholder="У" value="' + carbs + '" title="Углеводы">' +
                    '<input class="re-item-input re-input-sm" data-field="fiber" type="number" step="0.1" placeholder="Кл" value="' + fiber + '" title="Клетчатка">' +
                    '<input class="re-item-input" data-field="recipeId" placeholder="@id рецепта" value="' + escAttr(recipeId) + '" style="max-width:120px;font-size:11px">' +
                    '<span class="re-add-source manual" data-source-badge>✏️ вручную</span>' +
                '</div>' +
            '</div>' +
            '<button class="re-item-remove" data-editor-template-action="remove-item" title="Удалить">&times;</button>';
        list.appendChild(item);
        initDrag(item, list);

        // Auto-fetch nutrition when recipeId is entered
        var ridInput = item.querySelector('[data-field="recipeId"]');
        ridInput.addEventListener('blur', function() { fetchAddItemNutrition(item); });

        // If loaded with recipeId, show correct source badge
        if (recipeId) {
            var badge = item.querySelector('[data-source-badge]');
            badge.className = 're-add-source from-recipe';
            badge.textContent = '📗 из рецепта';
        }
    };

    // Fetch КБЖУ from an existing recipe by recipeId and fill add-item fields
    function fetchAddItemNutrition(item) {
        var ridInput = item.querySelector('[data-field="recipeId"]');
        var badge = item.querySelector('[data-source-badge]');
        var rid = ridInput.value.trim().replace(/^@/, '');
        if (!rid) {
            badge.className = 're-add-source manual';
            badge.textContent = '✏️ вручную';
            return;
        }
        badge.className = 're-add-source manual';
        badge.textContent = '⏳ загрузка...';
        api('/admin/recipes/' + encodeURIComponent(rid) + '/nutrition')
            .then(function(res) {
                if (res.error) {
                    badge.className = 're-add-source error';
                    badge.textContent = '⚠ не найден';
                    badge.title = res.error;
                    return;
                }
                item.querySelector('[data-field="kcal"]').value = res.kcal || 0;
                item.querySelector('[data-field="protein"]').value = res.protein || 0;
                item.querySelector('[data-field="fat"]').value = res.fat || 0;
                item.querySelector('[data-field="carbs"]').value = res.carbs || 0;
                item.querySelector('[data-field="fiber"]').value = res.fiber || 0;
                badge.className = 're-add-source from-recipe';
                badge.textContent = '📗 из рецепта';
                badge.title = res.name || rid;
            })
            .catch(function() {
                badge.className = 're-add-source error';
                badge.textContent = '⚠ ошибка';
            });
    }

    // ══════════════════════════════════════════════════════════════════════
    // REMOVE + DRAG & DROP
    // ══════════════════════════════════════════════════════════════════════

    window.removeItem = function(btn) {
        var item = btn.closest('.re-list-item');
        item.remove();
        renumberSteps();
        updateCounts();
    };

    var dragSrc = null;

    function initDrag(item, list) {
        item.addEventListener('dragstart', function(e) {
            dragSrc = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            var items = list.querySelectorAll('.re-list-item');
            items.forEach(function(el) { el.classList.remove('drag-over'); });
            dragSrc = null;
            renumberSteps();
        });
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // Only allow drop within same list
            if (dragSrc && dragSrc.parentNode === this.parentNode) {
                this.classList.add('drag-over');
            }
        });
        item.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });
        item.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            if (!dragSrc || dragSrc === this || dragSrc.parentNode !== this.parentNode) return;
            var parent = this.parentNode;
            var allItems = Array.from(parent.children);
            var fromIdx = allItems.indexOf(dragSrc);
            var toIdx = allItems.indexOf(this);
            if (fromIdx < toIdx) {
                parent.insertBefore(dragSrc, this.nextSibling);
            } else {
                parent.insertBefore(dragSrc, this);
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // COLLECT FORM DATA
    // ══════════════════════════════════════════════════════════════════════

    function normalizeVideoInput(raw) {
        if (!raw) return null;
        var text = String(raw).trim();
        var m = text.match(/<iframe[^>]*\s+src=(["'])(.*?)\1/i);
        return (m ? m[2] : text).trim() || null;
    }

    var DIETARY_FLAG_CODES = ['meat', 'fish', 'milk', 'eggs', 'gluten', 'peanuts', 'nuts', 'animal_products'];
    var DIETARY_FLAG_LABELS = {
        meat: 'мясо',
        fish: 'рыба',
        milk: 'молоко',
        eggs: 'яйца',
        gluten: 'глютен',
        peanuts: 'арахис',
        nuts: 'орехи',
        animal_products: 'животные продукты'
    };

    function parseDietaryFlags(raw) {
        var out = [];
        String(raw || '').split(',').forEach(function(value) {
            var flag = value.trim();
            if (DIETARY_FLAG_CODES.indexOf(flag) !== -1 && out.indexOf(flag) === -1) out.push(flag);
        });
        return out;
    }

    function normalizeEditorDietaryFlags(value) {
        return Array.isArray(value)
            ? parseDietaryFlags(value.join(','))
            : parseDietaryFlags(value);
    }

    function normalizeEditorDietarySwapOptions(value) {
        if (Array.isArray(value)) {
            return value.map(function(option) {
                if (!option || typeof option.name !== 'string' || !option.name.trim()) return null;
                return {
                    name: option.name.trim(),
                    dietary_flags: normalizeEditorDietaryFlags(option.dietary_flags)
                };
            }).filter(Boolean);
        }
        return String(value || '').split(';').map(function(entry) {
            var bits = entry.trim().split('|');
            var name = (bits.shift() || '').trim();
            if (!name) return null;
            return { name: name, dietary_flags: parseDietaryFlags(bits.join(',')) };
        }).filter(Boolean);
    }

    function editorDietaryChecksHtml(kind, flags) {
        var selected = normalizeEditorDietaryFlags(flags);
        var attr = kind === 'ingredient' ? 'data-ingredient-dietary-flag' : 'data-swap-dietary-flag';
        return DIETARY_FLAG_CODES.map(function(flag) {
            return '<label class="re-inline-dietary-check">' +
                '<input type="checkbox" ' + attr + '="' + flag + '"' + (selected.indexOf(flag) !== -1 ? ' checked' : '') + '>' +
                '<span>' + DIETARY_FLAG_LABELS[flag] + '</span>' +
            '</label>';
        }).join('');
    }

    function selectedDietaryFlags(container, selector) {
        if (!container) return [];
        return Array.from(container.querySelectorAll(selector + ':checked')).map(function(input) {
            return input.getAttribute(selector.slice(1, -1));
        }).filter(function(flag, index, flags) {
            return DIETARY_FLAG_CODES.indexOf(flag) !== -1 && flags.indexOf(flag) === index;
        });
    }

    function ingredientDietaryFlags(item) {
        return selectedDietaryFlags(item, '[data-ingredient-dietary-flag]');
    }

    function readSwapDietaryOptions(item) {
        if (!item) return [];
        return Array.from(item.querySelectorAll('[data-role="swap-dietary-option"]')).map(function(row) {
            var name = (row.getAttribute('data-option-name') || '').trim();
            if (!name) return null;
            return { name: name, dietary_flags: selectedDietaryFlags(row, '[data-swap-dietary-flag]') };
        }).filter(Boolean);
    }

    function renderSwapDietaryOptions(item, initialOptions) {
        if (!item) return;
        var input = item.querySelector('[data-field="swap_options"]');
        var box = item.querySelector('[data-role="swap-dietary-options"]');
        if (!input || !box) return;
        var previousByName = {};
        readSwapDietaryOptions(item).forEach(function(option) {
            previousByName[option.name.toLowerCase()] = option.dietary_flags;
        });
        var options = Array.isArray(initialOptions)
            ? normalizeEditorDietarySwapOptions(initialOptions)
            : normalizeEditorDietarySwapOptions(input.value);
        options.forEach(function(option) {
            var previous = previousByName[option.name.toLowerCase()];
            if (previous && !option.dietary_flags.length) option.dietary_flags = previous;
        });
        box.innerHTML = options.map(function(option) {
            return '<div class="re-swap-dietary-option" data-role="swap-dietary-option" data-option-name="' + escAttr(option.name) + '">' +
                '<span class="re-swap-dietary-option-name">' + esc(option.name) + '</span>' +
                '<div class="re-inline-dietary-checks">' + editorDietaryChecksHtml('swap', option.dietary_flags) + '</div>' +
            '</div>';
        }).join('');
    }

    function syncRecipeDietaryFlagsFromIngredients() {
        var ingredientFlags = [];
        document.querySelectorAll('#re-ingredients-list .re-list-item').forEach(function(item) {
            ingredientDietaryFlags(item).forEach(function(flag) {
                if (ingredientFlags.indexOf(flag) === -1) ingredientFlags.push(flag);
            });
        });
        document.querySelectorAll('[data-recipe-dietary-flag]').forEach(function(input) {
            var flag = input.getAttribute('data-recipe-dietary-flag');
            if (ingredientFlags.indexOf(flag) !== -1 && !input.checked) {
                input.checked = true;
                input.dataset.autoDerived = 'true';
            } else if (ingredientFlags.indexOf(flag) === -1 && input.dataset.autoDerived === 'true') {
                input.checked = false;
                delete input.dataset.autoDerived;
            }
        });
        getRecipeDietaryFlags();
    }

    function setRecipeDietaryFlags(flags) {
        var normalized = Array.isArray(flags) ? flags : parseDietaryFlags(flags);
        var field = document.getElementById('re-dietary-flags');
        if (field) field.value = normalized.join(', ');
        document.querySelectorAll('[data-recipe-dietary-flag]').forEach(function(input) {
            input.checked = normalized.indexOf(input.getAttribute('data-recipe-dietary-flag')) !== -1;
        });
    }

    function getRecipeDietaryFlags() {
        var out = [];
        document.querySelectorAll('[data-recipe-dietary-flag]:checked').forEach(function(input) {
            var flag = input.getAttribute('data-recipe-dietary-flag');
            if (DIETARY_FLAG_CODES.indexOf(flag) !== -1 && out.indexOf(flag) === -1) out.push(flag);
        });
        var field = document.getElementById('re-dietary-flags');
        if (field) field.value = out.join(', ');
        return out;
    }

    function parseDietarySwapOptions(raw) {
        return normalizeEditorDietarySwapOptions(raw);
    }

    function readIngredientNutrition(item, prefix) {
        return {
            kcal: parseFloat(item.querySelector('[data-role="' + prefix + '-kcal"]').value) || 0,
            protein: parseFloat(item.querySelector('[data-role="' + prefix + '-protein"]').value) || 0,
            fat: parseFloat(item.querySelector('[data-role="' + prefix + '-fat"]').value) || 0,
            carbs: parseFloat(item.querySelector('[data-role="' + prefix + '-carbs"]').value) || 0,
            fiber: parseFloat(item.querySelector('[data-role="' + prefix + '-fiber"]').value) || 0
        };
    }

    function readSwapReplacementRows(item) {
        return Array.from(item.querySelectorAll('[data-role="swap-replacement-row"]')).map(function(row) {
            return {
                name: row.getAttribute('data-name') || '',
                nutrition: readIngredientNutrition(row, 'swap-replacement')
            };
        }).filter(function(row) {
            var n = row.nutrition;
            return row.name || n.kcal || n.protein || n.fat || n.carbs || n.fiber;
        });
    }

    function collectFormData() {
        // Ingredients
        var ingredients = [];
        var ingrItems = document.getElementById('re-ingredients-list').children;
        for (var i = 0; i < ingrItems.length; i++) {
            var name = ingrItems[i].querySelector('[data-field="name"]').value.trim();
            if (!name) continue;
            var swap = ingrItems[i].querySelector('[data-field="swap"]').value.trim();
            var omitInput = ingrItems[i].querySelector('[data-field="omit"]');
            var omitText = omitInput ? omitInput.value.trim() : '';
            if (!omitText && isOptionalSwapText(swap)) {
                omitText = swap;
                swap = '';
            }
            var ingredient = { name: name, swap: swap || null };
            if (omitText) ingredient.omit = omitText;
            var currentIngredientDietaryFlags = ingredientDietaryFlags(ingrItems[i]);
            if (currentIngredientDietaryFlags.length) ingredient.dietary_flags = currentIngredientDietaryFlags;
            var dietarySwapOptions = readSwapDietaryOptions(ingrItems[i]);
            if (dietarySwapOptions.length) ingredient.swap_options = dietarySwapOptions;
            var isOptional = !!omitText || (swap && isOptionalSwapText(swap));
            var swapNutritionToggle = ingrItems[i].querySelector('[data-role="swap-nutrition-toggle"]');
            if (swap && !isOptionalSwapText(swap) && swapNutritionToggle && swapNutritionToggle.checked) {
                var originalNutrition = readIngredientNutrition(ingrItems[i], 'swap-original');
                var replacementRows = readSwapReplacementRows(ingrItems[i]);
                var replacementNutrition = replacementRows.length
                    ? replacementRows[0].nutrition
                    : readIngredientNutrition(ingrItems[i], 'swap-replacement');
                ingredient.swap_nutrition = {
                    original: originalNutrition,
                    replacement: replacementNutrition
                };
                if (replacementRows.length) ingredient.swap_nutrition.replacements = replacementRows;
            }
            var omitToggle = ingrItems[i].querySelector('[data-role="omit-toggle"]');
            if (isOptional && omitToggle && omitToggle.checked) {
                ingredient.omit_nutrition = readIngredientNutrition(ingrItems[i], 'omit');
                ingredient.omit_delta = nutritionToNegativeDelta(ingredient.omit_nutrition);
            }
            if (isOptional) {
                var hintInput = ingrItems[i].querySelector('[data-field="omit_hint"]');
                var hintVal = hintInput ? hintInput.value.trim() : '';
                if (hintVal) ingredient.omit_hint = hintVal;
            }
            ingredients.push(ingredient);
        }

        // Steps
        var steps = [];
        var stepItems = document.getElementById('re-steps-list').children;
        for (var i = 0; i < stepItems.length; i++) {
            var text = stepItems[i].querySelector('[data-field="text"]').value.trim();
            if (!text) continue;
            var photo = normalizeStepPhotoForSave(stepItems[i].querySelector('[data-field="photo"]').value);
            if (photo) {
                steps.push({ text: text, photo: photo });
            } else {
                steps.push(text);
            }
        }

        // Add-panels
        function collectAddPanel(type) {
            var result = [];
            var items = document.getElementById('re-add-' + type + '-list').children;
            for (var i = 0; i < items.length; i++) {
                var n = items[i].querySelector('[data-field="name"]').value.trim();
                if (!n) continue;
                var obj = {
                    name: n,
                    kcal: parseFloat(items[i].querySelector('[data-field="kcal"]').value) || 0,
                    protein: parseFloat(items[i].querySelector('[data-field="protein"]').value) || 0,
                    fat: parseFloat(items[i].querySelector('[data-field="fat"]').value) || 0,
                    carbs: parseFloat(items[i].querySelector('[data-field="carbs"]').value) || 0,
                    fiber: parseFloat(items[i].querySelector('[data-field="fiber"]').value) || 0
                };
                var rid = items[i].querySelector('[data-field="recipeId"]').value.trim();
                if (rid) obj.recipeId = rid.replace(/^@/, '');
                result.push(obj);
            }
            return result;
        }

        syncRecipeDietaryFlagsFromIngredients();
        var tags = document.getElementById('re-tags').value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
        var categories = getCategories();

        return {
            id: document.getElementById('re-id').value.trim(),
            categories: categories,
            cat: categories[0] || '',
            name: document.getElementById('re-name').value.trim(),
            emoji: document.getElementById('re-emoji').value || '🍴',
            time_min: parseInt(document.getElementById('re-time').value) || 30,
            time_label: document.getElementById('re-time-label').value.trim() || null,
            difficulty: document.getElementById('re-diff').value,
            servings: parseInt(document.getElementById('re-servings').value) || 4,
            portion_grams: parseInt(document.getElementById('re-portion-grams').value) || 300,
            sort_order: parseInt(document.getElementById('re-sort-order').value) || 0,
            kcal: parseInt(document.getElementById('re-kcal').value) || 0,
            protein: parseFloat(document.getElementById('re-protein').value) || 0,
            fat: parseFloat(document.getElementById('re-fat').value) || 0,
            carbs: parseFloat(document.getElementById('re-carbs').value) || 0,
            fiber: parseFloat(document.getElementById('re-fiber').value) || 0,
            photo: document.getElementById('re-photo').value.trim() || null,
            img_position: document.getElementById('re-img-position').value || null,
            quote: document.getElementById('re-quote').value.trim() || null,
            note: document.getElementById('re-note').value.trim() || null,
            tags: tags,
            dietary_flags: getRecipeDietaryFlags(),
            dietary_verified: document.getElementById('re-dietary-verified').checked,
            yt_video: normalizeVideoInput(document.getElementById('re-yt-video').value),
            vk_video: normalizeVideoInput(document.getElementById('re-vk-video').value),
            dzen_video: normalizeVideoInput(document.getElementById('re-dzen-video').value),
            // access_level — источник истины. is_free сервер автоматически зеркалит.
            access_level: (document.getElementById('re-access-level') && document.getElementById('re-access-level').value) || 'pro',
            is_free: document.getElementById('re-free').checked,
            is_published: document.getElementById('re-published').checked,
            is_soup: categories.indexOf('soups') !== -1 || document.getElementById('re-is-soup').checked,
            ingredients: ingredients,
            steps: steps,
            add_protein: collectAddPanel('protein'),
            add_fat: collectAddPanel('fat'),
            add_carbs: collectAddPanel('carbs'),
            add_fiber: collectAddPanel('fiber'),
            auto_addons: collectAutoAddons(),
            // Основные ингредиенты для навигационных выборок (ingredient.html).
            // НЕ состав рецепта, не влияют на КБЖУ. Массив id из справочника ingredients.js.
            main_ingredients: collectMainIngredients()
        };
    }

    function populateMainIngredientGroupSelect() {
        var select = document.getElementById('re-mi-group');
        if (!select || !window.SP_INGREDIENTS) return;
        var groups = SP_INGREDIENTS.groups || [];
        select.innerHTML = groups.map(function(group) {
            return '<option value="' + escAttr(group.id) + '">' + esc(group.name) + '</option>';
        }).join('');
        if (!select.value && groups[0]) select.value = groups[0].id;
    }

    function currentMainIngredientSelection(extraId) {
        var selected = collectMainIngredients();
        if (extraId && selected.indexOf(extraId) === -1) selected.push(extraId);
        return selected;
    }

    function setMainIngredientAddStatus(text, isError) {
        var status = document.getElementById('re-mi-add-status');
        if (!status) return;
        status.textContent = text || '';
        status.style.color = isError ? 'var(--red)' : 'var(--text-3)';
    }

    window.addMainIngredientToCatalog = function() {
        var groupEl = document.getElementById('re-mi-group');
        var nameEl = document.getElementById('re-mi-name');
        var idEl = document.getElementById('re-mi-id');
        var group = groupEl ? groupEl.value.trim() : '';
        var name = nameEl ? nameEl.value.trim() : '';
        var id = idEl ? idEl.value.trim().toLowerCase() : '';
        if (!name) { setMainIngredientAddStatus('Введите название ингредиента.', true); return; }
        if (!id) id = slugify(name).substring(0, 50);
        if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(id)) {
            setMainIngredientAddStatus('id: латиница/цифры/дефис, 3–50 символов. Например: cod.', true);
            return;
        }
        if (!group) { setMainIngredientAddStatus('Выберите группу.', true); return; }
        if (idEl) idEl.value = id;

        api('/admin/ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, name: name, group_id: group })
        }).then(function(saved) {
            if (!saved || saved.error) throw new Error(saved && saved.error ? saved.error : 'Не удалось добавить ингредиент.');
            if (window.SP_INGREDIENTS && typeof SP_INGREDIENTS.addIngredient === 'function') {
                SP_INGREDIENTS.addIngredient(saved);
            }
            renderMainIngredients(currentMainIngredientSelection(id));
            if (nameEl) nameEl.value = '';
            if (idEl) idEl.value = '';
            setMainIngredientAddStatus('Добавлено в справочник и отмечено в рецепте: ' + saved.name + '.', false);
        }).catch(function(err) {
            setMainIngredientAddStatus((err && err.message) || 'Не удалось добавить ингредиент.', true);
        });
    };

    // Собирает отмеченные чекбоксы «Основные ингредиенты для выборок».
    function collectMainIngredients() {
        var boxes = document.querySelectorAll('#re-main-ingredients input[type="checkbox"]:checked');
        var out = [];
        for (var i = 0; i < boxes.length; i++) out.push(boxes[i].value);
        return out;
    }

    // Строит чекбоксы по справочнику (группы как в dropdown «Ингредиенты»)
    // и отмечает переданные id. selected — массив id (recipe.main_ingredients).
    function renderMainIngredients(selected) {
        var host = document.getElementById('re-main-ingredients');
        if (!host) return;
        var sel = {};
        (selected || []).forEach(function (id) { sel[id] = true; });
        var groups = (window.SP_INGREDIENTS && SP_INGREDIENTS.byGroup()) || [];
        if (!groups.length) { host.innerHTML = '<div class="re-hint">Справочник ингредиентов недоступен.</div>'; return; }
        host.innerHTML = groups.map(function (g) {
            var items = g.items.map(function (it) {
                var checked = sel[it.id] ? ' checked' : '';
                return '<label class="re-mi-item"><input type="checkbox" value="' + escAttr(it.id) + '"' + checked + '> ' + esc(it.name) + '</label>';
            }).join('');
            return '<div class="re-mi-group"><div class="re-mi-group-title">' + esc(g.name) + '</div>' + items + '</div>';
        }).join('');
    }

    function collectAutoAddons() {
        // Passthrough non-UI fields from last loaded auto_addons
        // so that UI editing fromCategory doesn't wipe existing rule details.
        var slots = ['protein', 'fat', 'carbs', 'fiber'];
        var out = {};
        var prev = window._lastLoadedAutoAddons || {};
        slots.forEach(function(s) {
            var v = document.getElementById('re-aa-' + s).value;
            var prevRule = prev[s] || {};
            if (v || (Array.isArray(prevRule.items) && prevRule.items.length) || (Array.isArray(prevRule.order) && prevRule.order.length)) {
                var rule = {};
                if (v) rule.fromCategory = v;
                if (Array.isArray(prevRule.items) && prevRule.items.length) rule.items = prevRule.items;
                if (Array.isArray(prevRule.order) && prevRule.order.length) rule.order = prevRule.order;
                out[s] = rule;
            }
        });
        return out;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SAVE
    // ══════════════════════════════════════════════════════════════════════

    window.saveRecipe = function() {
        var body = collectFormData();

        if (!validateForm(body)) return;

        var btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.textContent = 'Сохраняю...';

        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/admin/recipes/' + editId : '/admin/recipes';

        api(url, { method: method, body: body }).then(function(res) {
            btn.disabled = false;
            btn.textContent = 'Сохранить';

            if (res.error) {
                showToast(res.error, true);
                // Handle duplicate ID from server
                if (res.error.indexOf('уже существует') !== -1) {
                    setError('re-id', res.error);
                }
                return;
            }

            var wasCreate = !editId;

            // Clear draft BEFORE mutating editId, otherwise clearDraft uses the new id
            // and the stale `_new` key survives, leaking old data into the next create session.
            clearDraft();

            if (!editId) {
                editId = body.id;
                isCreateMode = false;
                originalRecipe = body;
                document.getElementById('re-id').disabled = true;
                document.getElementById('btn-gen-slug').style.display = 'none';
                document.getElementById('create-hint').style.display = 'none';
                history.replaceState(null, '', 'recipe-editor.html?id=' + encodeURIComponent(body.id));
            } else {
                originalRecipe = body;
            }
            document.getElementById('recipe-header').innerHTML =
                esc(body.emoji) + ' ' + esc(body.name) + ' <em>(' + esc(body.id) + ')</em>';
            updateStatusBadge();
            lastSavedJson = JSON.stringify(body);
            if (typeof clearContentCache === 'function') clearContentCache();

            showSaveSuccess(body, wasCreate);
        }).catch(function() {
            btn.disabled = false;
            btn.textContent = 'Сохранить';
            showToast('Ошибка сохранения', true);
        });
    };

    // ══════════════════════════════════════════════════════════════════════
    // SAVE SUCCESS
    // ══════════════════════════════════════════════════════════════════════

    function showSaveSuccess(data, wasCreate) {
        var overlay = document.getElementById('save-success');
        document.getElementById('save-success-title').textContent =
            wasCreate ? 'Рецепт создан!' : 'Рецепт сохранён';
        document.getElementById('save-success-sub').textContent =
            (data.emoji || '') + ' ' + (data.name || '') + (data.published ? '' : ' (черновик)');

        var openLink = document.getElementById('save-success-open');
        openLink.href = 'recipe.html?id=' + encodeURIComponent(data.id) + '&source=admin-preview';

        overlay.classList.add('visible');
    }

    window.dismissSuccess = function() {
        document.getElementById('save-success').classList.remove('visible');
    };

    // close on overlay click (outside the card)
    document.getElementById('save-success').addEventListener('click', function(e) {
        if (e.target === this) dismissSuccess();
    });

    // ══════════════════════════════════════════════════════════════════════
    // UI HELPERS
    // ══════════════════════════════════════════════════════════════════════

    function updateKbzhuBar() {
        document.getElementById('kbzhu-kcal').textContent = document.getElementById('re-kcal').value || '0';
        document.getElementById('kbzhu-protein').textContent = document.getElementById('re-protein').value || '0';
        document.getElementById('kbzhu-fat').textContent = document.getElementById('re-fat').value || '0';
        document.getElementById('kbzhu-carbs').textContent = document.getElementById('re-carbs').value || '0';
        document.getElementById('kbzhu-fiber').textContent = document.getElementById('re-fiber').value || '0';
    }

    document.querySelectorAll('.re-kbzhu-input').forEach(function(el) {
        el.addEventListener('input', updateKbzhuBar);
    });

    function resolvePhotoUrl(p) {
        if (!p) return p;
        if (/^(https?:|data:|blob:)/i.test(p)) return p;
        return 'https://voronova.online/' + p.replace(/^\/+/, '');
    }

    function updatePhotoPreview() {
        var url = document.getElementById('re-photo').value.trim();
        var preview = document.getElementById('re-photo-preview');
        if (url) {
            preview.src = resolvePhotoUrl(url);
            preview.classList.add('visible');
            preview.onerror = function() { preview.classList.remove('visible'); };
        } else {
            preview.classList.remove('visible');
            preview.removeAttribute('src');
        }
    }

    document.getElementById('re-photo').addEventListener('change', updatePhotoPreview);
    document.getElementById('re-photo').addEventListener('blur', updatePhotoPreview);

    // Second listener on re-name: update header display (first one handles auto-slug)
    document.getElementById('re-name').addEventListener('input', function() {
        var name = this.value.trim();
        var emoji = document.getElementById('re-emoji').value || '';
        var id = document.getElementById('re-id').value || '';
        if (name) {
            document.getElementById('recipe-header').innerHTML =
                esc(emoji) + ' ' + esc(name) + (id ? ' <em>(' + esc(id) + ')</em>' : '');
        } else {
            document.getElementById('recipe-header').textContent = 'Новый рецепт';
        }
        updateStatusBadge();
    });

    // ══════════════════════════════════════════════════════════════════════
    // AUTOSAVE (localStorage)
    // ══════════════════════════════════════════════════════════════════════

    var DRAFT_KEY = 'recipe_editor_draft';
    var autosaveTimer = null;
    var hasDirtyChanges = false;
    var lastSavedJson = '';

    function getDraftKey() {
        return DRAFT_KEY + '_' + (editId || '_new');
    }

    function scheduleSave() {
        hasDirtyChanges = true;
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(saveDraft, 3000);
    }

    function saveDraft() {
        try {
            var data = collectFormData();
            var json = JSON.stringify(data);
            if (json === lastSavedJson) return; // skip if unchanged
            localStorage.setItem(getDraftKey(), JSON.stringify({
                data: data,
                savedAt: new Date().toISOString()
            }));
            lastSavedJson = json;
            showAutosaveStatus('saved');
        } catch(e) { /* localStorage full or unavailable — silent fail */ }
    }

    function showAutosaveStatus(state) {
        var el = document.getElementById('autosave-status');
        if (state === 'saved') {
            el.className = 're-autosave saved';
            el.textContent = 'Черновик сохранён';
            setTimeout(function() { el.textContent = ''; el.className = 're-autosave'; }, 2000);
        }
    }

    function checkForDraft() {
        try {
            var raw = localStorage.getItem(getDraftKey());
            if (!raw) return;
            var draft = JSON.parse(raw);
            if (!draft.data || !draft.savedAt) return;
            // Don't offer draft if we just loaded a recipe from server
            // (offer only if data differs or is a new recipe)
            var banner = document.getElementById('draft-banner');
            var dateEl = document.getElementById('draft-date');
            var d = new Date(draft.savedAt);
            dateEl.textContent = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
            banner.style.display = 'flex';
        } catch(e) { /* corrupt draft — ignore */ }
    }

    window.restoreDraft = function() {
        try {
            var raw = localStorage.getItem(getDraftKey());
            if (!raw) return;
            var draft = JSON.parse(raw);
            if (!draft.data) return;
            var r = draft.data;

            // Clear existing lists
            document.getElementById('re-ingredients-list').innerHTML = '';
            document.getElementById('re-steps-list').innerHTML = '';
            document.getElementById('re-add-protein-list').innerHTML = '';
            document.getElementById('re-add-fat-list').innerHTML = '';
            document.getElementById('re-add-carbs-list').innerHTML = '';
            document.getElementById('re-add-fiber-list').innerHTML = '';

            // Fill simple fields
            if (!editId && r.id) { document.getElementById('re-id').value = r.id; }
            if (r.categories) { setCategories(r.categories); } else if (r.cat) { setCategories([r.cat]); }
            if (r.name) document.getElementById('re-name').value = r.name;
            document.getElementById('re-emoji').value = r.emoji || '🍴';
            document.getElementById('re-time').value = r.time_min || 30;
            if (r.time_label) document.getElementById('re-time-label').value = r.time_label;
            document.getElementById('re-diff').value = r.difficulty || 'easy';
            document.getElementById('re-servings').value = r.servings || 4;
            document.getElementById('re-portion-grams').value = r.portion_grams || 300;
            document.getElementById('re-sort-order').value = r.sort_order || 0;
            document.getElementById('re-published').checked = !!r.is_published;
            document.getElementById('re-free').checked = !!r.is_free;
            const _alSel2 = document.getElementById('re-access-level');
            if (_alSel2) _alSel2.value = r.access_level || (r.is_free ? 'free' : 'pro');
            document.getElementById('re-is-soup').checked = !!r.is_soup || getCategories().indexOf('soups') !== -1;
            syncSoupFlagFromCategories();
            document.getElementById('re-photo').value = r.photo || '';
            document.getElementById('re-img-position').value = r.img_position || '';
            document.getElementById('re-quote').value = r.quote || '';
            document.getElementById('re-note').value = r.note || '';
            document.getElementById('re-tags').value = (r.tags || []).join(', ');
            setRecipeDietaryFlags(r.dietary_flags || []);
            document.getElementById('re-dietary-verified').checked = r.dietary_verified === true;
            document.getElementById('re-yt-video').value = r.yt_video || '';
            document.getElementById('re-vk-video').value = r.vk_video || '';
            document.getElementById('re-dzen-video').value = r.dzen_video || '';
            document.getElementById('re-kcal').value = r.kcal || 0;
            document.getElementById('re-protein').value = r.protein || 0;
            document.getElementById('re-fat').value = r.fat || 0;
            document.getElementById('re-carbs').value = r.carbs || 0;
            document.getElementById('re-fiber').value = r.fiber || 0;
            updateKbzhuBar();

            // Ingredients
            (r.ingredients || []).forEach(function(item) {
                if (typeof item === 'string') item = { name: item };
                addIngredient(item.name || '', item.swap || '', item.omit_nutrition || nutritionDeltaToPositive(item.omit_delta) || null, item.omit_hint || '', item.dietary_flags || [], item.swap_options || [], item.swap_nutrition || null, item.omit || '');
            });
            syncRecipeDietaryFlagsFromIngredients();

            // Steps
            (r.steps || []).forEach(function(s) {
                if (typeof s === 'string') addStep(s, '');
                else addStep(s.text || '', s.photo || '');
            });

            // Add-panels
            populateAddPanel('protein', r.add_protein);
            populateAddPanel('fat', r.add_fat);
            populateAddPanel('carbs', r.add_carbs);
            populateAddPanel('fiber', r.add_fiber);

            // Основные ингредиенты для выборок
            renderMainIngredients(r.main_ingredients || []);

            updatePhotoPreview();
            updateStatusBadge();
            updateCounts();

            // Update header
            if (r.name) {
                document.getElementById('recipe-header').innerHTML =
                    esc(r.emoji || '') + ' ' + esc(r.name) + (r.id ? ' <em>(' + esc(r.id) + ')</em>' : '');
                updateStatusBadge();
            }

            showToast('Черновик восстановлен');
        } catch(e) {
            showToast('Ошибка восстановления', true);
        }
        document.getElementById('draft-banner').style.display = 'none';
    };

    window.discardDraft = function() {
        try { localStorage.removeItem(getDraftKey()); } catch(e) {}
        document.getElementById('draft-banner').style.display = 'none';
    };

    function clearDraft() {
        try { localStorage.removeItem(getDraftKey()); } catch(e) {}
        hasDirtyChanges = false;
    }

    // Listen for changes on all inputs
    var previewRefreshTimer = null;
    function schedulePreviewRefresh() {
        scheduleSave();
        clearTimeout(previewRefreshTimer);
        previewRefreshTimer = setTimeout(function() {
            if (document.getElementById('preview-section').classList.contains('open')) renderPreview();
        }, 500);
    }
    document.getElementById('editor-content').addEventListener('input', schedulePreviewRefresh);
    document.getElementById('editor-content').addEventListener('change', schedulePreviewRefresh);
    document.getElementById('re-dietary-checks').addEventListener('change', function(event) {
        var input = event.target;
        if (input && input.hasAttribute('data-recipe-dietary-flag')) delete input.dataset.autoDerived;
    });

    // ══════════════════════════════════════════════════════════════════════
    // UNSAVED CHANGES WARNING
    // ══════════════════════════════════════════════════════════════════════

    window.addEventListener('beforeunload', function(e) {
        if (hasDirtyChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // NUTRITION CALCULATOR (USDA)
    // ══════════════════════════════════════════════════════════════════════

    var lastNutritionResult = null;

    window.calcNutrition = function() {
        var ingrItems = document.getElementById('re-ingredients-list').children;
        var ingredients = [];
        for (var i = 0; i < ingrItems.length; i++) {
            var name = ingrItems[i].querySelector('[data-field="name"]').value.trim();
            if (name) ingredients.push({ name: name });
        }
        if (!ingredients.length) {
            showToast('Добавьте ингредиенты для расчёта', true);
            return;
        }
        var servings = parseInt(document.getElementById('re-servings').value) || 1;
        var btn = document.getElementById('btn-calc-nutrition');
        var status = document.getElementById('nutrition-status');
        btn.disabled = true;
        status.textContent = 'Рассчитываю через USDA...';

        api('/admin/nutrition/calculate', {
            method: 'POST',
            body: { ingredients: ingredients, servings: servings }
        }).then(function(res) {
            btn.disabled = false;
            status.textContent = '';
            if (res.error) {
                showToast(res.error, true);
                return;
            }
            lastNutritionResult = res;
            renderNutritionResult(res);
        }).catch(function() {
            btn.disabled = false;
            status.textContent = '';
            showToast('Ошибка соединения с сервером', true);
        });
    };

    function renderNutritionResult(res) {
        var panel = document.getElementById('nutrition-panel');
        panel.classList.add('open');

        // Summary
        var summaryEl = document.getElementById('nutrition-summary');
        summaryEl.innerHTML =
            '<div class="re-nutrition-summary-col">' +
                '<h4>На весь рецепт</h4>' +
                '<div class="re-nutrition-summary-row">' +
                    nutrSummaryItem(res.total.kcal, 'ккал') +
                    nutrSummaryItem(res.total.protein, 'Б') +
                    nutrSummaryItem(res.total.fat, 'Ж') +
                    nutrSummaryItem(res.total.carbs, 'У') +
                    nutrSummaryItem(res.total.fiber, 'Кл') +
                '</div>' +
            '</div>' +
            '<div class="re-nutrition-summary-col">' +
                '<h4>На порцию (' + res.servings + ' порц.)</h4>' +
                '<div class="re-nutrition-summary-row">' +
                    nutrSummaryItem(res.per_serving.kcal, 'ккал') +
                    nutrSummaryItem(res.per_serving.protein, 'Б') +
                    nutrSummaryItem(res.per_serving.fat, 'Ж') +
                    nutrSummaryItem(res.per_serving.carbs, 'У') +
                    nutrSummaryItem(res.per_serving.fiber, 'Кл') +
                '</div>' +
            '</div>';

        // Table
        var tbody = document.getElementById('nutrition-tbody');
        tbody.innerHTML = '';
        res.items.forEach(function(item, idx) {
            var statusClass = item.confidence;
            var statusLabel = item.confidence === 'high' ? '🟢 найдено' :
                              item.confidence === 'medium' ? '🟡 проверить' : '🔴 не найдено';

            var matchedHtml = item.matched ? esc(item.matched) : '—';
            if (item.alternatives && item.alternatives.length > 1) {
                matchedHtml = '<select class="re-nutr-alt-select" data-item-idx="' + idx + '" data-editor-template-change="select-nutr-alt">';
                item.alternatives.forEach(function(alt, ai) {
                    matchedHtml += '<option value="' + ai + '"' + (ai === 0 ? ' selected' : '') + '>' + esc(alt.description) + '</option>';
                });
                matchedHtml += '</select>';
            }

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(item.original) + '</td>' +
                '<td>' + (item.amount_g ? item.amount_g + ' г' : '?') + '</td>' +
                '<td>' + matchedHtml + '</td>' +
                '<td><span class="re-nutr-status ' + statusClass + '">' + statusLabel + '</span></td>' +
                '<td>' + item.nutrition.kcal + '</td>' +
                '<td>' + item.nutrition.protein + '</td>' +
                '<td>' + item.nutrition.fat + '</td>' +
                '<td>' + item.nutrition.carbs + '</td>' +
                '<td>' + item.nutrition.fiber + '</td>';
            tbody.appendChild(tr);
        });

        // Warnings
        var warningsEl = document.getElementById('nutrition-warnings');
        if (res.warnings && res.warnings.length) {
            warningsEl.innerHTML = '<b>Предупреждения:</b><ul>' +
                res.warnings.map(function(w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
        } else {
            warningsEl.innerHTML = '';
        }
    }

    function nutrSummaryItem(val, label) {
        return '<div class="re-nutrition-summary-item">' +
            '<div class="val">' + val + '</div>' +
            '<div class="label">' + label + '</div>' +
        '</div>';
    }

    window.applyNutrition = function() {
        if (!lastNutritionResult) return;
        var ps = lastNutritionResult.per_serving;
        document.getElementById('re-kcal').value = Math.round(ps.kcal);
        document.getElementById('re-protein').value = ps.protein;
        document.getElementById('re-fat').value = ps.fat;
        document.getElementById('re-carbs').value = ps.carbs;
        document.getElementById('re-fiber').value = ps.fiber;
        updateKbzhuBar();
        showToast('КБЖУ применены (на порцию)');
    };

    window.selectNutrAlt = function(select) {
        // Placeholder for future: re-calculate with alternative USDA food
        showToast('Альтернатива выбрана. Пересчёт будет в следующей версии.', false);
    };

    // ══════════════════════════════════════════════════════════════════════
    // PREVIEW
    // ══════════════════════════════════════════════════════════════════════

    window.togglePreview = function() {
        var sec = document.getElementById('preview-section');
        sec.classList.toggle('open');
        if (sec.classList.contains('open')) renderPreview();
    };

    function renderPreview() {
        var data = collectFormData();
        var container = document.getElementById('preview-card-container');
        var DIFF_LABELS = { easy: 'Простой', medium: 'Средний', hard: 'Сложный' };

        var imgHtml;
        if (data.photo) {
            imgHtml = '<img src="' + escAttr(resolvePhotoUrl(data.photo)) + '" style="' + (data.img_position ? 'object-position:' + data.img_position : '') + '" data-editor-preview-fallback="' + escAttr(data.emoji || '🍴') + '">';
        } else {
            imgHtml = data.emoji || '🍴';
        }

        var tagsHtml = '';
        if (data.tags && data.tags.length) {
            tagsHtml = '<div class="re-preview-card-tags">' +
                data.tags.map(function(t) { return '<span class="re-preview-card-tag">' + esc(t) + '</span>'; }).join('') +
                '</div>';
        }

        var html = '<div class="re-preview-card">' +
            '<div class="re-preview-card-img">' + imgHtml + '</div>' +
            '<div class="re-preview-card-body">' +
                '<div class="re-preview-card-name">' + esc(data.emoji || '') + ' ' + esc(data.name || 'Без названия') + '</div>' +
                '<div class="re-preview-card-meta">' +
                    '<span>' + (data.time_min || '?') + ' мин</span>' +
                    '<span>' + (DIFF_LABELS[data.difficulty] || '?') + '</span>' +
                    '<span>' + (data.servings || '?') + ' порц.</span>' +
                    (data.portion_grams ? '<span>' + data.portion_grams + ' г/порц.</span>' : '') +
                '</div>' +
                tagsHtml +
                '<div class="re-preview-card-kbzhu">' +
                    '<div class="re-preview-kbzhu-item"><div class="re-preview-kbzhu-val">' + (data.kcal || 0) + '</div><div class="re-preview-kbzhu-label">ккал</div></div>' +
                    '<div class="re-preview-kbzhu-item"><div class="re-preview-kbzhu-val">' + (data.protein || 0) + '</div><div class="re-preview-kbzhu-label">Б</div></div>' +
                    '<div class="re-preview-kbzhu-item"><div class="re-preview-kbzhu-val">' + (data.fat || 0) + '</div><div class="re-preview-kbzhu-label">Ж</div></div>' +
                    '<div class="re-preview-kbzhu-item"><div class="re-preview-kbzhu-val">' + (data.carbs || 0) + '</div><div class="re-preview-kbzhu-label">У</div></div>' +
                    '<div class="re-preview-kbzhu-item"><div class="re-preview-kbzhu-val">' + (data.fiber || 0) + '</div><div class="re-preview-kbzhu-label">Кл</div></div>' +
                '</div>' +
            '</div>' +
        '</div>';

        if (editId) {
            html += '<div style="margin-top:12px;text-align:center">' +
                '<a href="recipe.html?id=' + encodeURIComponent(editId) + '&source=admin-preview" target="_blank" ' +
                'style="font-size:12px;color:var(--accent);text-decoration:none;font-weight:600">' +
                'Открыть полную страницу рецепта &rarr;</a></div>';
        }

        container.innerHTML = html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // AI AUTOFILL
    // ══════════════════════════════════════════════════════════════════════

    window.toggleAiPanel = function() {
        document.getElementById('ai-panel').classList.toggle('open');
    };

    window.aiParseRecipe = function() {
        var text = document.getElementById('ai-input').value.trim();
        if (!text) { showToast('Вставьте текст рецепта', true); return; }

        var btn = document.getElementById('ai-parse-btn');
        var status = document.getElementById('ai-status');
        var resultEl = document.getElementById('ai-result');
        btn.disabled = true;
        status.textContent = 'AI анализирует рецепт...';
        resultEl.innerHTML = '';

        api('/admin/recipes/parse-text', { method: 'POST', body: { text: text } })
            .then(function(res) {
                btn.disabled = false;
                status.textContent = '';

                if (res.error) {
                    resultEl.innerHTML = '<div class="re-ai-result error"><b>Ошибка:</b> ' + esc(res.error) + '</div>';
                    return;
                }

                if (!res.recipe) {
                    resultEl.innerHTML = '<div class="re-ai-result error"><b>AI не вернул данные рецепта</b></div>';
                    return;
                }

                applyAiResult(res.recipe);
            })
            .catch(function(err) {
                btn.disabled = false;
                status.textContent = '';
                resultEl.innerHTML = '<div class="re-ai-result error"><b>Ошибка соединения</b></div>';
            });
    };

    var FIELD_LABELS = {
        name: 'Название', cat: 'Категория', emoji: 'Эмодзи', time_min: 'Время', time_label: 'Подпись времени',
        difficulty: 'Сложность', servings: 'Порции', portion_grams: 'Грамм/порц.',
        kcal: 'Ккал', protein: 'Белки', fat: 'Жиры', carbs: 'Углеводы', fiber: 'Клетчатка',
        ingredients: 'Ингредиенты', steps: 'Шаги', tags: 'Теги',
        quote: 'Цитата', note: 'Примечание', photo: 'Фото',
        yt_video: 'YouTube', vk_video: 'VK Video', dzen_video: 'Дзен'
    };

    function applyAiResult(r) {
        var filled = [];
        var unfilled = [];

        // Reset transient warnings each AI run
        var _warnEl = document.getElementById('re-time-label-warn');
        if (_warnEl) _warnEl.style.display = 'none';

        // Simple fields
        if (r.name) { document.getElementById('re-name').value = r.name; filled.push('name'); }
        if (r.categories) { setCategories(r.categories); filled.push('cat'); } else if (r.cat) { setCategories([r.cat]); filled.push('cat'); }
        if (r.emoji) { document.getElementById('re-emoji').value = r.emoji; filled.push('emoji'); }
        if (r.time_min) { document.getElementById('re-time').value = r.time_min; filled.push('time_min'); }
        if (r.time_label) { document.getElementById('re-time-label').value = r.time_label; filled.push('time_label'); }
        // Серверный пост-фильтр снёс выдуманный диапазон → показываем предупреждение оператору.
        if (r._stripped_time_label && _warnEl) _warnEl.style.display = 'block';
        if (r.difficulty) { document.getElementById('re-diff').value = r.difficulty; filled.push('difficulty'); }
        if (r.servings) { document.getElementById('re-servings').value = r.servings; filled.push('servings'); }
        if (r.portion_grams) { document.getElementById('re-portion-grams').value = r.portion_grams; filled.push('portion_grams'); }
        if (r.quote) { document.getElementById('re-quote').value = r.quote; filled.push('quote'); }
        if (r.note) { document.getElementById('re-note').value = r.note; filled.push('note'); }

        // КБЖУ
        if (r.kcal !== undefined) { document.getElementById('re-kcal').value = r.kcal; filled.push('kcal'); }
        if (r.protein !== undefined) { document.getElementById('re-protein').value = r.protein; filled.push('protein'); }
        if (r.fat !== undefined) { document.getElementById('re-fat').value = r.fat; filled.push('fat'); }
        if (r.carbs !== undefined) { document.getElementById('re-carbs').value = r.carbs; filled.push('carbs'); }
        if (r.fiber !== undefined) { document.getElementById('re-fiber').value = r.fiber; filled.push('fiber'); }
        updateKbzhuBar();

        // Tags
        if (r.tags && r.tags.length) {
            var existing = document.getElementById('re-tags').value.trim();
            var newTags = r.tags.join(', ');
            document.getElementById('re-tags').value = existing ? existing + ', ' + newTags : newTags;
            filled.push('tags');
        }

        // Ingredients — clear existing and add new
        if (r.ingredients && r.ingredients.length) {
            document.getElementById('re-ingredients-list').innerHTML = '';
            r.ingredients.forEach(function(item) {
                if (typeof item === 'string') item = { name: item };
                addIngredient(item.name || '', item.swap || '', item.omit_nutrition || nutritionDeltaToPositive(item.omit_delta) || null, item.omit_hint || '', item.dietary_flags || [], item.swap_options || [], item.swap_nutrition || null, item.omit || '');
            });
            syncRecipeDietaryFlagsFromIngredients();
            filled.push('ingredients');
        }

        // Steps — clear existing and add new
        if (r.steps && r.steps.length) {
            document.getElementById('re-steps-list').innerHTML = '';
            r.steps.forEach(function(s) {
                if (typeof s === 'string') {
                    addStep(s, '');
                } else {
                    addStep(s.text || '', s.photo || '');
                }
            });
            filled.push('steps');
        }

        // Auto-generate slug from name (if in create mode)
        if (r.name && isCreateMode && !editId) {
            var slug = slugify(r.name);
            document.getElementById('re-id').value = slug;
            document.getElementById('re-id').setAttribute('data-auto-source', r.name);
        }

        // Update header
        if (r.name) {
            var em = document.getElementById('re-emoji').value || '';
            var id = document.getElementById('re-id').value || '';
            document.getElementById('recipe-header').innerHTML =
                esc(em) + ' ' + esc(r.name) + (id ? ' <em>(' + esc(id) + ')</em>' : '');
            updateStatusBadge();
        }

        // Unfilled fields from AI
        var allFields = ['name', 'cat', 'emoji', 'time_min', 'time_label', 'difficulty', 'servings', 'portion_grams',
            'kcal', 'protein', 'fat', 'carbs', 'fiber', 'ingredients', 'steps', 'tags',
            'quote', 'note', 'photo', 'yt_video', 'vk_video', 'dzen_video'];
        var aiUnfilled = r._unfilled || [];
        allFields.forEach(function(f) {
            if (filled.indexOf(f) === -1 && unfilled.indexOf(f) === -1) unfilled.push(f);
        });

        // Show result
        var resultEl = document.getElementById('ai-result');
        var html = '<div class="re-ai-result success">';
        html += '<b>AI заполнил ' + filled.length + ' из ' + allFields.length + ' полей</b>';
        html += '<div class="re-ai-filled-list">';
        filled.forEach(function(f) {
            html += '<span class="re-ai-filled-tag filled">' + (FIELD_LABELS[f] || f) + ' ✓</span>';
        });
        unfilled.forEach(function(f) {
            html += '<span class="re-ai-filled-tag unfilled">' + (FIELD_LABELS[f] || f) + '</span>';
        });
        html += '</div>';
        // КБЖУ: только ручной ввод (автоматический расчёт отключён, см. блок с кнопкой calc)
        var hasIngredients = filled.indexOf('ingredients') !== -1;
        var hasKbzhu = filled.indexOf('kcal') !== -1;
        if (hasIngredients && !hasKbzhu) {
            html += '<div style="margin-top:10px;padding:10px;background:#fff3e0;border-radius:8px;font-size:12px">' +
                '<b>КБЖУ не указаны.</b> Заполните поля вручную — по готовому блюду.' +
            '</div>';
        }

        html += '<div style="margin-top:10px;font-size:12px;color:var(--text-3)">Проверьте заполненные поля и нажмите «Сохранить» когда всё готово.</div>';
        html += '</div>';
        resultEl.innerHTML = html;

        updateCounts();
        showToast('AI заполнил черновик — проверьте данные');
    }

    window.goBack = function() {
        if (hasDirtyChanges) {
            if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return;
        }
        hasDirtyChanges = false; // prevent beforeunload double-prompt
        location.href = 'admin.html?tab=recipes';
    };

    // Clear validation errors on input
    ['re-id', 're-name'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', function() { clearError(id); });
    });
    document.getElementById('re-cat').addEventListener('change', function(ev) {
        var t = ev.target;
        if (!t || !t.dataset) return;
        if (t.dataset.role !== 'member') return;
        refreshCategoryRowState();
        clearError('re-cat');
    });

    // CSP: static editor controls migrated from HTML event attributes.
    document.querySelectorAll('[data-editor-static-action]').forEach(function(control) {
        control.addEventListener('click', function() {
            var action = control.dataset.editorStaticAction;
            if (action === 'go-back') goBack();
            else if (action === 'save-recipe') saveRecipe();
            else if (action === 'restore-draft') restoreDraft();
            else if (action === 'discard-draft') discardDraft();
            else if (action === 'toggle-ai-panel') toggleAiPanel();
            else if (action === 'ai-parse-recipe') aiParseRecipe();
            else if (action === 'generate-slug') generateSlug();
            else if (action === 'calc-nutrition') calcNutrition();
            else if (action === 'apply-nutrition') applyNutrition();
            else if (action === 'apply-nutrition-close') {
                applyNutrition();
                document.getElementById('nutrition-panel').classList.remove('open');
            }
            else if (action === 'add-ingredient') addIngredient();
            else if (action === 'add-main-ingredient-to-catalog') addMainIngredientToCatalog();
            else if (action === 'add-step') addStep();
            else if (action === 'add-addon-item') addAddItem(control.dataset.addonGroup || '');
            else if (action === 'toggle-preview') togglePreview();
            else if (action === 'dismiss-success') dismissSuccess();
        });
    });

    // CSP: controls created by editor templates use delegated events.
    document.addEventListener('click', function(event) {
        var control = event.target.closest('[data-editor-template-action]');
        if (!control) return;
        if (control.dataset.editorTemplateAction === 'remove-item') removeItem(control);
    });
    document.addEventListener('change', function(event) {
        var control = event.target.closest('[data-editor-template-change]');
        if (!control) return;
        if (control.dataset.editorTemplateChange === 'select-nutr-alt') selectNutrAlt(control);
    });
    document.addEventListener('error', function(event) {
        var image = event.target;
        if (!image || !image.hasAttribute || !image.hasAttribute('data-editor-preview-fallback')) return;
        if (image.parentNode) image.parentNode.textContent = image.dataset.editorPreviewFallback || '🍴';
    }, true);

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();
