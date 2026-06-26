(function() {
    // ── Auth check ──
    if (!Auth.isLoggedIn()) { location.href = 'login.html?return=admin.html'; return; }
    var user = Auth.getUser();
    if (!user || user.role !== 'admin') { alert('Нет прав администратора'); location.href = 'index.html'; return; }
    document.getElementById('admin-email').textContent = user.email || '';

    // Keep token alive — without this the access token expires after ~15 min and saves fail with 401
    Auth.startAutoRefresh();

    var allUsers = [];
    var confirmPaymentId = null;

    // ── API helper ──
    function api(path, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        // Refresh token if missing (e.g. new tab with empty sessionStorage)
        var _doFetch = function() {
            opts.headers['Authorization'] = 'Bearer ' + Auth.getToken();
            return fetch(API_BASE + path, opts).then(function(res) {
                function parseOrThrow(response) {
                    return response.json().catch(function() { return {}; }).then(function(data) {
                        if (!response.ok) {
                            throw new Error((data && data.error) || ('HTTP ' + response.status));
                        }
                        return data;
                    });
                }
                if (res.status === 401) {
                    return Auth.refreshToken().then(function(ok) {
                        if (ok) {
                            opts.headers['Authorization'] = 'Bearer ' + Auth.getToken();
                            return fetch(API_BASE + path, opts).then(function(r2) {
                                if (r2.status === 401) { location.href = 'login.html?return=admin.html'; }
                                if (r2.status === 403) { showToast('Нет прав администратора'); throw new Error('403'); }
                                if (r2.status === 429) { showToast('Слишком много запросов, подождите'); throw new Error('429'); }
                                return parseOrThrow(r2);
                            });
                        }
                        location.href = 'login.html?return=admin.html';
                    });
                }
                if (res.status === 403) { showToast('Нет прав администратора'); throw new Error('403'); }
                if (res.status === 429) { showToast('Слишком много запросов, подождите'); throw new Error('429'); }
                return parseOrThrow(res);
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

    // ── Tabs ──
    window.switchTab = function(tab) {
        document.querySelectorAll('.adm-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
        document.querySelectorAll('.adm-section').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('sec-' + tab).classList.add('active');

        if (tab === 'users' && !allUsers.length) loadUsers();
        if (tab === 'payments') loadPayments('pending');
        if (tab === 'news') loadNews();
        if (tab === 'recipes') loadRecipesList();
        if (tab === 'categories') loadCategoriesList();
        if (tab === 'feedback') loadFeedback('waiting_admin');
        if (tab === 'audit') loadAudit();
    };

    // Preload categories meta on page init (needed by recipes tab + modal)
    loadCategoriesMeta();

    // ── Stats ──
    // Load feedback badge count on init
    api('/admin/feedback?limit=1').then(function(data) {
        var newCount = data.totalNew || 0;
        var badge = document.getElementById('feedback-badge');
        if (newCount > 0) { badge.textContent = newCount; badge.style.display = 'inline'; }
    }).catch(function() {});

    function loadStats() {
        api('/admin/stats').then(function(data) {
            var grid = document.getElementById('stats-grid');
            grid.innerHTML =
                statCard('Всего', data.totalUsers, 'accent') +
                statCard('Trial', data.trials, 'blue-l') +
                statCard('Активных', data.active, 'green') +
                statCard('Истекших', data.expired, 'yellow') +
                statCard('Заблокированных', data.blocked || 0, 'red') +
                statCard('Ожидают оплату', data.pendingPayments, 'red');

            var badge = document.getElementById('pending-badge');
            if (data.pendingPayments > 0) {
                badge.textContent = data.pendingPayments;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }).catch(function() {
            document.getElementById('stats-grid').innerHTML = '<div class="adm-empty">Ошибка загрузки. Проверьте, что у вас роль admin.</div>';
        });
    }

    function statCard(label, num, colorClass) {
        return '<div class="adm-stat-card ' + colorClass + '">' +
            '<div class="adm-stat-label">' + label + '</div>' +
            '<div class="adm-stat-num">' + num + '</div></div>';
    }

    // ── Users ──
    function loadUsers() {
        api('/admin/users').then(function(data) {
            allUsers = data;
            renderUsers(data);
        });
    }
    window.loadUsers = loadUsers;

    function renderUsers(users) {
        var tbody = document.getElementById('users-tbody');
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="adm-empty">Нет пользователей</td></tr>';
            return;
        }
        tbody.innerHTML = users.map(function(u) {
            var isAdmin = u.role === 'admin';
            var status = isAdmin ? 'admin' : (u.sub_status || 'нет');
            var statusClass = isAdmin ? 'st-active' : ('st-' + status);
            var untilDate = '';
            if (isAdmin) untilDate = '∞';
            else if (u.sub_status === 'trial' && u.trial_ends_at) untilDate = fmtDate(u.trial_ends_at);
            else if (u.sub_status === 'active' && u.active_until) untilDate = fmtDate(u.active_until);

            var actions = '';
            if (u.is_blocked) {
                actions = '<button class="adm-btn adm-btn-unblock" onclick="unblockUser(\'' + u.id + '\')">Разблокировать</button>';
            } else if (u.role !== 'admin') {
                actions = '<button class="adm-btn adm-btn-extend" onclick="openExtendModalById(\'' + u.id + '\')">Продлить</button>' +
                    '<button class="adm-btn adm-btn-block" onclick="blockUserById(\'' + u.id + '\')">Блок</button>';
            } else {
                actions = '<span style="color:var(--text-3);font-size:12px">admin</span>';
            }

            return '<tr>' +
                '<td><strong>' + esc(u.email || '—') + '</strong></td>' +
                '<td>' + esc(u.display_name || '—') + '</td>' +
                '<td><span class="st-badge ' + statusClass + '">' + status + '</span></td>' +
                '<td class="adm-date">' + untilDate + '</td>' +
                '<td class="adm-date">' + fmtDate(u.created_at) + '</td>' +
                '<td>' + actions + '</td>' +
                '</tr>';
        }).join('');
    }

    window.filterUsers = function() {
        var q = document.getElementById('user-search').value.toLowerCase();
        var statusFilter = document.getElementById('user-status-filter').value;
        var filtered = allUsers.filter(function(u) {
            if (q && !(u.email && u.email.toLowerCase().includes(q)) && !(u.display_name && u.display_name.toLowerCase().includes(q))) return false;
            if (statusFilter === 'admin') return u.role === 'admin';
            if (statusFilter === 'blocked') return u.is_blocked;
            if (statusFilter && u.role === 'admin') return false;
            if (statusFilter && (u.sub_status || 'нет') !== statusFilter) return false;
            return true;
        });
        renderUsers(filtered);
    };

    function findUserById(id) {
        // id из onclick всегда строка, allUsers.id может быть числом/UUID
        return allUsers.find(function(u) { return String(u.id) === String(id); });
    }

    window.blockUserById = function(id) {
        var u = findUserById(id);
        if (!u) { showToast('Пользователь не найден'); return; }
        if (!confirm('Заблокировать ' + (u.email || '') + '?')) return;
        api('/admin/users/' + id + '/block', { method: 'POST' }).then(function() {
            showToast('Пользователь заблокирован');
            loadUsers();
            loadStats();
        });
    };

    window.unblockUser = function(id) {
        api('/admin/users/' + id + '/unblock', { method: 'POST' }).then(function() {
            showToast('Пользователь разблокирован');
            loadUsers();
            loadStats();
        });
    };

    var extendUserId = null;
    window.openExtendModalById = function(id) {
        var u = findUserById(id);
        if (!u) { showToast('Пользователь не найден'); return; }
        extendUserId = id;
        document.getElementById('extend-user-email').textContent = u.email || '';
        var untilEl = document.getElementById('extend-current-until');
        if (u.active_until) {
            var until = new Date(u.active_until);
            var now = new Date();
            untilEl.textContent = until > now
                ? 'Активна до: ' + fmtDate(u.active_until)
                : 'Истекла: ' + fmtDate(u.active_until);
        } else {
            untilEl.textContent = 'Активной подписки нет';
        }
        document.getElementById('extend-days').value = 30;
        document.getElementById('extend-modal').classList.add('open');
    };

    window.closeExtendModal = function() {
        document.getElementById('extend-modal').classList.remove('open');
        extendUserId = null;
    };

    window.submitExtend = function() {
        if (!extendUserId) return;
        var days = parseInt(document.getElementById('extend-days').value, 10);
        if (!days || days < 1 || days > 3650) {
            showToast('Введите число дней от 1 до 3650');
            return;
        }
        var btn = document.getElementById('extend-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Отправка...';
        api('/admin/users/' + extendUserId + '/extend', {
            method: 'POST',
            body: { days: days }
        }).then(function(data) {
            showToast(data.message || 'Подписка продлена');
            closeExtendModal();
            loadUsers();
            loadStats();
        }).catch(function(e) {
            showToast(e.message || 'Ошибка');
        }).finally(function() {
            btn.disabled = false;
            btn.textContent = 'Продлить';
        });
    };

    // ── Payments ──
    window.loadPayments = function(status) {
        document.querySelectorAll('[id^="pay-filter-"]').forEach(function(b) {
            b.style.background = b.id === 'pay-filter-' + status ? 'var(--accent)' : '';
            b.style.color = b.id === 'pay-filter-' + status ? '#fff' : '';
        });

        api('/admin/payments?status=' + status).then(function(data) {
            var tbody = document.getElementById('payments-tbody');
            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="adm-empty">Нет платежей со статусом "' + status + '"</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(function(p) {
                var statusBadge = '<span class="st-badge st-' + p.status + '">' + p.status + '</span>';
                var actions = '';
                if (p.status === 'pending') {
                    actions =
                        '<button class="adm-btn adm-btn-confirm" onclick="openConfirm(\'' + p.id + '\')">OK</button>' +
                        '<button class="adm-btn adm-btn-reject" onclick="rejectPayment(\'' + p.id + '\')">X</button>';
                } else if (p.admin_comment) {
                    actions = '<span style="font-size:11px;color:var(--text-3)">' + esc(p.admin_comment) + '</span>';
                }

                var screenCol = p.has_screenshot
                    ? '<a href="#" onclick="showScreenshot(\'' + p.id + '\');return false" style="color:var(--blue);font-size:12px">📎 Открыть</a>'
                    : '<span style="color:var(--text-3);font-size:12px">—</span>';

                return '<tr>' +
                    '<td><strong>' + esc(p.email) + '</strong></td>' +
                    '<td>' + p.amount + ' &#8381;</td>' +
                    '<td class="adm-date">' + (p.payment_date ? fmtDateTime(p.payment_date, p.created_at) : fmtDateTime(p.created_at)) + '</td>' +
                    '<td>' + screenCol + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                    '<td>' + actions + '</td>' +
                    '</tr>';
            }).join('');
        });
    };

    window.openConfirm = function(paymentId) {
        confirmPaymentId = paymentId;
        document.getElementById('confirm-months').value = '1';
        document.getElementById('confirm-comment').value = '';
        document.getElementById('confirm-modal').classList.add('open');
    };

    window.closeModal = function() {
        document.getElementById('confirm-modal').classList.remove('open');
        confirmPaymentId = null;
    };

    window.submitConfirm = function() {
        if (!confirmPaymentId) return;
        var months = Number(document.getElementById('confirm-months').value);
        var comment = document.getElementById('confirm-comment').value;
        var btn = document.getElementById('confirm-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Отправка...';
        api('/admin/payments/' + confirmPaymentId + '/confirm', {
            method: 'POST',
            body: { months: months, comment: comment }
        }).then(function(data) {
            showToast(data.message || 'Подтверждено');
            closeModal();
            loadPayments('pending');
            loadStats();
        }).catch(function() {
            showToast('Ошибка');
        }).finally(function() {
            btn.disabled = false;
            btn.textContent = 'Подтвердить';
        });
    };

    window.showScreenshot = function(id) {
        api('/admin/payments/' + id + '/screenshot').then(function(data) {
            if (data.screenshot) {
                document.getElementById('screenshot-modal-img').src = data.screenshot;
                document.getElementById('screenshot-modal').classList.add('open');
            } else {
                showToast('Скриншот не найден');
            }
        });
    };

    window.rejectPayment = function(id) {
        if (!confirm('Отклонить платёж?')) return;
        var comment = prompt('Укажите причину отклонения платежа:', '');
        if (comment === null) return;
        comment = comment.trim();
        if (!comment) {
            showToast('Причина отклонения обязательна');
            return;
        }
        api('/admin/payments/' + id + '/reject', {
            method: 'POST',
            body: { comment: comment }
        }).then(function() {
            showToast('Платёж отклонён');
            loadPayments('pending');
            loadStats();
        }).catch(function(e) {
            showToast(e.message || 'Ошибка');
        });
    };

    // ── Helpers ──
    function fmtDate(d) {
        if (!d) return '—';
        var date = new Date(d);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function fmtDateTime(d, timeSource) {
        if (!d) return '—';
        var date = new Date(d);
        var dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        // Если payment_date — это просто дата без времени, берём время из created_at
        var tSrc = timeSource ? new Date(timeSource) : date;
        var timeStr = tSrc.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return dateStr + ' ' + timeStr;
    }

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(msg) {
        var toast = document.getElementById('adm-toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2500);
    }

    window.doLogout = function() {
        Auth.logout();
        location.href = 'login.html?return=admin.html';
    };

    // ── NEWS ──────────────────────────────────────────────────────────────────
    var allNews = [];

    function loadNews() {
        api('/admin/news').then(function(data) {
            allNews = data;
            renderNews(data);
        });
    }

    function renderNews(items) {
        var el = document.getElementById('news-list');
        if (!items.length) { el.innerHTML = '<div class="adm-empty">Нет новостей</div>'; return; }
        el.innerHTML = items.map(function(n) {
            var status = n.is_published ? '<span style="color:var(--green);font-weight:700">●</span>' : '<span style="color:var(--text-3)">Черновик</span>';
            var d = fmtDate(n.created_at);
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="font-size:13px;color:var(--text);line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(n.text) + '</div>'
                + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">' + d + ' · ' + (n.type === 'recipe' ? 'Рецепт: ' + (n.recipe_id || '') : 'Текст') + ' · ' + status + '</div>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">'
                + '<button class="adm-btn" onclick="editNews(' + n.id + ')" style="font-size:12px;padding:6px 10px">✏️</button>'
                + '<button class="adm-btn adm-btn-reject" onclick="deleteNews(' + n.id + ')" style="font-size:12px;padding:6px 10px"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>'
                + '</div></div>';
        }).join('');
    }

    window.openNewsModal = function(newsItem) {
        var m = document.getElementById('news-modal');
        document.getElementById('news-modal-title').textContent = newsItem ? 'Редактировать' : 'Новая новость';
        document.getElementById('news-edit-id').value = newsItem ? newsItem.id : '';
        document.getElementById('news-type').value = newsItem ? newsItem.type : 'news';
        document.getElementById('news-text').value = newsItem ? newsItem.text : '';
        document.getElementById('news-recipe-id').value = newsItem ? (newsItem.recipe_id || '') : '';
        document.getElementById('news-badge').value = newsItem ? (newsItem.badge || '') : '';
        document.getElementById('news-label').value = newsItem ? (newsItem.label || '') : '';
        document.getElementById('news-published').checked = newsItem ? newsItem.is_published : true;
        toggleNewsRecipeFields();
        m.classList.add('open');
    };

    document.getElementById('news-type').addEventListener('change', toggleNewsRecipeFields);
    function toggleNewsRecipeFields() {
        var isRecipe = document.getElementById('news-type').value === 'recipe';
        document.getElementById('news-recipe-field').style.display = isRecipe ? '' : 'none';
        document.getElementById('news-badge-field').style.display = isRecipe ? '' : 'none';
        document.getElementById('news-label-field').style.display = isRecipe ? '' : 'none';
    }

    window.closeNewsModal = function() { document.getElementById('news-modal').classList.remove('open'); };

    window.editNews = function(id) {
        var item = allNews.find(function(n) { return n.id === id; });
        if (item) openNewsModal(item);
    };

    window.deleteNews = function(id) {
        if (!confirm('Удалить новость?')) return;
        api('/admin/news/' + id, { method: 'DELETE' }).then(function() {
            showToast('Удалено');
            loadNews();
        });
    };

    window.saveNews = function() {
        var editId = document.getElementById('news-edit-id').value;
        var body = {
            type: document.getElementById('news-type').value,
            text: document.getElementById('news-text').value,
            recipe_id: document.getElementById('news-recipe-id').value || null,
            badge: document.getElementById('news-badge').value || null,
            label: document.getElementById('news-label').value || null,
            is_published: document.getElementById('news-published').checked
        };
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/admin/news/' + editId : '/admin/news';
        api(url, { method: method, body: body }).then(function() {
            closeNewsModal();
            showToast('Сохранено');
            loadNews();
        }).catch(function() { showToast('Ошибка'); });
    };

    // ── RECIPES ───────────────────────────────────────────────────────────────
    var allRecipes = [];
    var recipeCatFilter = 'all';
    var allCategories = [];          // full category objects from API
    var CAT_NAMES = {};              // populated from /content/categories on init

    function getRecipeAccessLevel(r) {
        return r.access_level || (r.is_free ? 'free' : 'pro');
    }

    function recipeHasVideo(r) {
        return !!(r.vk_video || r.yt_video || r.dzen_video);
    }

    function recipeHasPhoto(r) {
        return typeof r.photo === 'string' && r.photo.trim().length > 0;
    }

    function recipeHasNutrition(r) {
        return ['kcal', 'protein', 'fat', 'carbs'].every(function(key) {
            var value = Number(r[key]);
            return Number.isFinite(value) && value > 0;
        });
    }

    function hasAutoAddonsRule(rule) {
        if (!rule || typeof rule !== 'object') return false;
        return Object.keys(rule).some(function(key) {
            var slot = rule[key];
            return slot && typeof slot === 'object' && Object.keys(slot).length > 0;
        });
    }

    function isSoupRecipe(r) {
        var rc = r.categories || (r.cat ? [r.cat] : []);
        return rc.indexOf('soups') !== -1 || !!r.is_soup;
    }

    function recipeHasAutoAddons(r) {
        if (hasAutoAddonsRule(r.auto_addons)) return true;
        if (isSoupRecipe(r)) return true;
        if ((r.name || '').toLowerCase().indexOf('плов') !== -1) return true;
        var rc = r.categories || (r.cat ? [r.cat] : []);
        return rc.some(function(catId) {
            var cat = allCategories.find(function(c) { return c.id === catId; });
            return cat && hasAutoAddonsRule(cat.auto_addons);
        });
    }

    function loadCategoriesMeta() {
        return api('/content/categories').then(function(cats) {
            allCategories = cats || [];
            CAT_NAMES = {};
            allCategories.forEach(function(c) { CAT_NAMES[c.id] = c.name; });
        }).catch(function() {});
    }
    window.loadCategoriesMeta = loadCategoriesMeta;

    function loadRecipesList() {
        api('/admin/recipes').then(function(data) {
            allRecipes = data;
            renderCatFilters();
            applyRecipeFilters();
        });
    }

    function renderCatFilters() {
        var cats = {};
        allRecipes.forEach(function(r) {
            var rc = r.categories || (r.cat ? [r.cat] : []);
            rc.forEach(function(c) { cats[c] = (cats[c] || 0) + 1; });
        });
        var el = document.getElementById('recipe-cat-filters');
        var html = '<button class="adm-btn' + (recipeCatFilter === 'all' ? '' : '') + '" style="font-size:12px;padding:6px 12px;' + (recipeCatFilter === 'all' ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '') + '" onclick="setRecipeCat(\'all\')">Все (' + allRecipes.length + ')</button>';
        Object.keys(cats).forEach(function(cat) {
            var active = recipeCatFilter === cat;
            html += '<button class="adm-btn" style="font-size:12px;padding:6px 12px;' + (active ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '') + '" onclick="setRecipeCat(\'' + cat + '\')">' + (CAT_NAMES[cat] || cat) + ' (' + cats[cat] + ')</button>';
        });
        el.innerHTML = html;
    }

    window.setRecipeCat = function(cat) {
        recipeCatFilter = cat;
        renderCatFilters();
        applyRecipeFilters();
    };

    function applyRecipeFilters() {
        var q = document.getElementById('recipe-search').value.toLowerCase();
        var statusFilter = document.getElementById('recipe-status-filter').value;
        var accessFilter = document.getElementById('recipe-access-filter').value;
        var seasonalFilter = document.getElementById('recipe-seasonal-filter').value;
        var videoFilter = document.getElementById('recipe-video-filter').value;
        var photoFilter = document.getElementById('recipe-photo-filter').value;
        var nutritionFilter = document.getElementById('recipe-nutrition-filter').value;
        var addonsFilter = document.getElementById('recipe-addons-filter').value;
        var soupFilter = document.getElementById('recipe-soup-filter').value;
        var filtered = allRecipes.filter(function(r) {
            var rc = r.categories || (r.cat ? [r.cat] : []);
            if (recipeCatFilter !== 'all' && rc.indexOf(recipeCatFilter) === -1) return false;
            if (statusFilter === 'published' && !r.is_published) return false;
            if (statusFilter === 'unpublished' && r.is_published) return false;
            if (accessFilter !== 'all' && getRecipeAccessLevel(r) !== accessFilter) return false;
            if (seasonalFilter === 'seasonal' && !r.is_seasonal) return false;
            if (seasonalFilter === 'not-seasonal' && r.is_seasonal) return false;
            if (videoFilter === 'with-video' && !recipeHasVideo(r)) return false;
            if (videoFilter === 'without-video' && recipeHasVideo(r)) return false;
            if (photoFilter === 'with-photo' && !recipeHasPhoto(r)) return false;
            if (photoFilter === 'without-photo' && recipeHasPhoto(r)) return false;
            if (nutritionFilter === 'nutrition-filled' && !recipeHasNutrition(r)) return false;
            if (nutritionFilter === 'nutrition-missing' && recipeHasNutrition(r)) return false;
            if (addonsFilter === 'with-addons' && !recipeHasAutoAddons(r)) return false;
            if (addonsFilter === 'without-addons' && recipeHasAutoAddons(r)) return false;
            if (soupFilter === 'soups' && !isSoupRecipe(r)) return false;
            if (soupFilter === 'not-soups' && isSoupRecipe(r)) return false;
            if (q && !r.name.toLowerCase().includes(q) && !r.id.includes(q)) return false;
            return true;
        });
        renderRecipesList(filtered);
    }

    function renderRecipesList(items) {
        var el = document.getElementById('recipes-list');
        if (!items.length) { el.innerHTML = '<div class="adm-empty">Нет рецептов</div>'; return; }
        el.innerHTML = items.map(function(r) {
            var badge;
            if (!r.is_published) {
                badge = '<span class="rbadge rbadge-draft">Не опубликован</span>';
            } else if (getRecipeAccessLevel(r) === 'free') {
                badge = '<span class="rbadge rbadge-free">Free</span>';
            } else if (getRecipeAccessLevel(r) === 'trial') {
                badge = '<span class="rbadge rbadge-trial">Trial</span>';
            } else {
                badge = '<span class="rbadge rbadge-pro">Pro</span>';
            }
            var seasonalMark = r.is_seasonal
                ? '<span class="rbadge" style="background:#fff2ed;color:var(--accent);border:1px solid var(--accent);font-weight:700">★ Сезонный</span>'
                : '';
            var seasonalBtn = r.is_seasonal
                ? '<button class="adm-btn" onclick="clearSeasonal()" style="font-size:12px;padding:6px 10px;background:var(--accent);color:#fff;border-color:var(--accent)" title="Снять признак сезонного">★ Снять</button>'
                : (r.is_published
                    ? '<button class="adm-btn" onclick="setSeasonal(\'' + r.id + '\')" style="font-size:12px;padding:6px 10px" title="Назначить сезонным рецептом на главной">☆ Сезонный</button>'
                    : '');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text);flex-wrap:wrap">' + badge + seasonalMark + '<span>' + (r.emoji || '') + ' ' + esc(r.name) + '</span></div>'
                + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">' + (r.categories || [r.cat]).map(function(c) { return CAT_NAMES[c] || c; }).join(', ') + ' · ' + (r.time_label || (r.time_min + ' мин')) + ' · ' + r.kcal + ' ккал</div>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;flex-wrap:wrap;justify-content:flex-end">'
                + seasonalBtn
                + '<button class="adm-btn" onclick="openRecipeEditor(\'' + r.id + '\')" style="font-size:12px;padding:6px 10px" title="Открыть в редакторе">✏️</button>'
                + '<button class="adm-btn adm-btn-reject" onclick="deleteRecipe(\'' + r.id + '\')" style="font-size:12px;padding:6px 10px"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>'
                + '</div></div>';
        }).join('');
    }

    window.setSeasonal = function(id) {
        var cur = allRecipes.find(function(x) { return x.is_seasonal; });
        var msg = cur && cur.id !== id
            ? 'Назначить «' + id + '» сезонным? «' + cur.name + '» перестанет быть сезонным.'
            : 'Назначить «' + id + '» сезонным рецептом?';
        if (!confirm(msg)) return;
        api('/admin/recipes/' + encodeURIComponent(id) + '/seasonal', { method: 'POST' }).then(function() {
            showToast('Сезонный рецепт назначен');
            loadRecipesList();
        });
    };

    window.clearSeasonal = function() {
        if (!confirm('Снять признак сезонного со всех рецептов?')) return;
        api('/admin/recipes/seasonal', { method: 'DELETE' }).then(function() {
            showToast('Сезонный рецепт сброшен');
            loadRecipesList();
        });
    };

    window.filterRecipes = function() {
        applyRecipeFilters();
    };

    window.openRecipeEditor = function(id) {
        location.href = 'recipe-editor.html?v=20260612-soups-category' + (id ? '&id=' + encodeURIComponent(id) : '');
    };

    window.deleteRecipe = function(id) {
        if (!confirm('Удалить рецепт «' + id + '»?')) return;
        api('/admin/recipes/' + id, { method: 'DELETE' }).then(function() {
            showToast('Удалено');
            loadRecipesList();
        });
    };

    // ── CATEGORIES ────────────────────────────────────────────────────────────
    var AA_SLOTS = [
        { key: 'protein', label: '💪 Белок',     field: 'cat-aa-protein' },
        { key: 'fat',     label: '🥑 Жиры',      field: 'cat-aa-fat' },
        { key: 'carbs',   label: '🌾 Углеводы',  field: 'cat-aa-carbs' },
        { key: 'fiber',   label: '🥬 Клетчатка', field: 'cat-aa-fiber' }
    ];

    function loadCategoriesList() {
        api('/admin/categories').then(function(cats) {
            allCategories = cats || [];
            CAT_NAMES = {};
            allCategories.forEach(function(c) { CAT_NAMES[c.id] = c.name; });
            renderCategoriesList();
        });
    }

    function renderCategoriesList() {
        var el = document.getElementById('categories-list');
        if (!allCategories.length) { el.innerHTML = '<div class="adm-empty">Нет категорий</div>'; return; }
        el.innerHTML = allCategories.map(function(c) {
            var aa = c.auto_addons || {};
            var rules = AA_SLOTS.map(function(s) {
                var r = aa[s.key];
                if (!r || (!r.fromCategory && !(Array.isArray(r.order) && r.order.length) && !(Array.isArray(r.items) && r.items.length))) return '';
                var name = r.fromCategory ? (CAT_NAMES[r.fromCategory] || r.fromCategory) : 'точный список';
                var suffix = r.fromCategory ? ' ← ' + esc(name) : ': ' + esc(name);
                if (Array.isArray(r.items) && r.items.length && r.fromCategory) suffix += ' + точный список';
                return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;margin:2px 2px 0 0">' + s.label + suffix + '</span>';
            }).join('');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="font-size:14px;font-weight:600">' + (c.emoji || '') + ' ' + esc(c.name) + ' <span style="font-size:11px;color:var(--text-3);font-weight:400">(' + c.id + ')</span></div>'
                + (c.description ? '<div style="font-size:11px;color:var(--text-3);margin-top:2px">' + esc(c.description) + '</div>' : '')
                + (rules ? '<div style="margin-top:6px">' + rules + '</div>' : '')
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">'
                + '<button class="adm-btn" onclick="editCategory(\'' + c.id + '\')" style="font-size:12px;padding:6px 10px">✏️</button>'
                + '</div></div>';
        }).join('');
    }

    function populateCatSelect(selectId, currentValue, excludeId) {
        var el = document.getElementById(selectId);
        var opts = '<option value="">— нет —</option>';
        allCategories.forEach(function(c) {
            if (c.id === excludeId) return;
            var sel = c.id === currentValue ? ' selected' : '';
            opts += '<option value="' + c.id + '"' + sel + '>' + esc(c.name) + '</option>';
        });
        el.innerHTML = opts;
    }

    function normalizeAddonOrderKey(value) {
        var key = String(value || '').trim();
        if (!key) return '';
        if (key.indexOf('recipe:') === 0 || key.indexOf('item:') === 0) return key;
        if (allRecipes.some(function(r) { return r.id === key; })) return 'recipe:' + key;
        return key;
    }

    function formatAddonOrder(order) {
        return Array.isArray(order) ? order.map(normalizeAddonOrderKey).filter(Boolean).join('\n') : '';
    }

    function parseAddonOrder(value) {
        return String(value || '')
            .split(/[\n,;]+/)
            .map(normalizeAddonOrderKey)
            .filter(Boolean);
    }

    function recipeInCategory(recipe, catId) {
        var cats = recipe.categories || (recipe.cat ? [recipe.cat] : []);
        return cats.indexOf(catId) !== -1;
    }

    function ensureAdminRecipesLoaded() {
        if (allRecipes.length) return Promise.resolve(allRecipes);
        return api('/admin/recipes').then(function(data) {
            allRecipes = data || [];
            return allRecipes;
        }).catch(function() { return []; });
    }

    function recipeOrderKey(recipe) {
        return recipe && recipe.id ? 'recipe:' + recipe.id : '';
    }

    function getAddonOrderCandidates(sourceCatId) {
        var out = [];
        var seen = {};
        function add(key, label, meta) {
            key = normalizeAddonOrderKey(key);
            if (!key || seen[key]) return;
            seen[key] = true;
            out.push({ key: key, label: label || key, meta: meta || '' });
        }
        if (sourceCatId) {
            allRecipes.forEach(function(r) {
                if (!r.is_published || !recipeInCategory(r, sourceCatId)) return;
                add(recipeOrderKey(r), (r.emoji ? r.emoji + ' ' : '') + (r.name || r.id), 'рецепт');
            });
        }
        return out;
    }

    function getAddonOrderItems(slot, sourceCatId) {
        var candidates = getAddonOrderCandidates(sourceCatId);
        var hidden = document.getElementById(slot.field + '-order');
        var order = parseAddonOrder(hidden ? hidden.value : '');
        if (!order.length) return candidates;
        var byKey = {};
        candidates.forEach(function(item) { byKey[item.key] = item; });
        var used = {};
        var ordered = [];
        order.forEach(function(key) {
            if (used[key]) return;
            if (!byKey[key]) return;
            used[key] = true;
            ordered.push(byKey[key]);
        });
        candidates.forEach(function(item) {
            if (!used[item.key]) ordered.push(item);
        });
        return ordered;
    }

    function renderAddonOrderPicker(field) {
        var slot = AA_SLOTS.find(function(s) { return s.field === field; });
        if (!slot) return;
        var listEl = document.getElementById(field + '-order-list');
        if (!listEl) return;
        var sourceCatId = document.getElementById(field).value;
        var items = getAddonOrderItems(slot, sourceCatId);
        if (!items.length) {
            listEl.innerHTML = '<div style="font-size:11px;color:var(--text-3);padding:8px 0">Выберите категорию-источник. Здесь показываются только рецепты с ID; разовые добавки без ID настраиваются в самих рецептах.</div>';
            return;
        }
        var hidden = document.getElementById(field + '-order');
        var hasCustom = !!(hidden && parseAddonOrder(hidden.value).length);
        listEl.innerHTML =
            '<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">Порядок рецептов из категории-источника. Двигайте названия, ID знать не нужно.</div>' +
            items.map(function(item, index) {
                return '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:#fff;margin-bottom:4px">' +
                    '<div style="display:flex;gap:4px;flex-shrink:0">' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" onclick="moveAddonOrder(\'' + field + '\',' + index + ',-1)"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" onclick="moveAddonOrder(\'' + field + '\',' + index + ',1)"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '</div>' +
                    '<div style="min-width:0;flex:1">' +
                    '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:normal">' + esc(item.label) + '</div>' +
                    (item.meta ? '<div style="font-size:10px;color:var(--text-3)">' + esc(item.meta) + '</div>' : '') +
                    '</div>' +
                    '</div>';
            }).join('') +
            (hasCustom ? '<button type="button" class="adm-btn" style="font-size:11px;padding:5px 9px;margin-top:2px" onclick="resetAddonOrder(\'' + field + '\')">Сбросить ручной порядок</button>' : '');
    }

    function parseExactItems(field) {
        var el = document.getElementById(field + '-items');
        if (!el || !el.value.trim()) return [];
        try {
            var items = JSON.parse(el.value);
            return Array.isArray(items) ? items.filter(function(item) {
                return item && (item.recipeId || item.name);
            }) : [];
        } catch (e) {
            return [];
        }
    }

    function setExactItems(field, items) {
        var el = document.getElementById(field + '-items');
        if (el) el.value = JSON.stringify((items || []).filter(function(item) {
            return item && (item.recipeId || item.name);
        }));
    }

    function recipeById(id) {
        return allRecipes.find(function(r) { return r.id === id; }) || null;
    }

    function exactItemLabel(item) {
        if (!item) return '';
        if (item.recipeId) {
            var r = recipeById(item.recipeId);
            return r ? ((r.emoji ? r.emoji + ' ' : '') + r.name) : item.recipeId;
        }
        return item.name + (item.amount ? ' · ' + item.amount : '');
    }

    function renderExactItems(field) {
        var listEl = document.getElementById(field + '-items-list');
        if (!listEl) return;
        var items = parseExactItems(field);
        var recipeOptions = '<option value="">Добавить рецепт...</option>' + allRecipes
            .filter(function(r) { return r.is_published; })
            .map(function(r) { return '<option value="' + esc(r.id) + '">' + esc((r.emoji ? r.emoji + ' ' : '') + r.name) + '</option>'; })
            .join('');
        var rows = items.length
            ? items.map(function(item, index) {
                return '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:#fff;margin-bottom:4px">' +
                    '<div style="display:flex;gap:4px;flex-shrink:0">' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" onclick="moveExactItem(\'' + field + '\',' + index + ',-1)"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" onclick="moveExactItem(\'' + field + '\',' + index + ',1)"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '</div>' +
                    '<div style="min-width:0;flex:1">' +
                    '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:normal">' + esc(exactItemLabel(item)) + '</div>' +
                    '<div style="font-size:10px;color:var(--text-3)">' + (item.recipeId ? 'рецепт из базы' : 'ручная добавка') + '</div>' +
                    '</div>' +
                    '<button type="button" class="adm-btn adm-btn-reject" style="font-size:12px;padding:3px 8px" onclick="removeExactItem(\'' + field + '\',' + index + ')">×</button>' +
                    '</div>';
            }).join('')
            : '<div style="font-size:11px;color:var(--text-3);padding:6px 0">Точный список пуст. Используйте его, когда нужны конкретные добавки, а не вся категория.</div>';
        listEl.innerHTML =
            '<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">Точный список: конкретные добавки для этого слота. Они показываются вместе с добавками из категории, если категория выбрана.</div>' +
            rows +
            '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">' +
            '<select class="adm-modal-select" id="' + field + '-exact-recipe" style="flex:1;font-size:12px;padding:7px 8px">' + recipeOptions + '</select>' +
            '<button type="button" class="adm-btn" style="font-size:12px;padding:7px 10px" onclick="addExactRecipe(\'' + field + '\')">Добавить</button>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;align-items:center">' +
            '<input class="adm-modal-input" id="' + field + '-exact-name" placeholder="Название" style="font-size:12px;padding:7px 8px;flex:2 1 170px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-amount" placeholder="Кол-во" style="font-size:12px;padding:7px 8px;flex:1 1 78px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-kcal" placeholder="ккал" type="number" style="font-size:12px;padding:7px 6px;width:54px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-protein" placeholder="б" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-fat" placeholder="ж" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-carbs" placeholder="у" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-fiber" placeholder="кл" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<button type="button" class="adm-btn" style="font-size:12px;padding:7px 10px" onclick="addExactStatic(\'' + field + '\')">Добавить</button>' +
            '</div>';
    }

    function renderAddonOrderPickers() {
        ensureAdminRecipesLoaded().then(function() {
            AA_SLOTS.forEach(function(s) {
                renderAddonOrderPicker(s.field);
                renderExactItems(s.field);
            });
        });
    }

    function wireAddonOrderSelect(slot) {
        var el = document.getElementById(slot.field);
        if (!el) return;
        el.onchange = function() {
            var hidden = document.getElementById(slot.field + '-order');
            if (hidden) hidden.value = '';
            renderAddonOrderPicker(slot.field);
        };
    }

    window.moveAddonOrder = function(field, index, dir) {
        var slot = AA_SLOTS.find(function(s) { return s.field === field; });
        if (!slot) return;
        var sourceCatId = document.getElementById(field).value;
        var items = getAddonOrderItems(slot, sourceCatId);
        var next = index + dir;
        if (next < 0 || next >= items.length) return;
        var tmp = items[index];
        items[index] = items[next];
        items[next] = tmp;
        var hidden = document.getElementById(field + '-order');
        if (hidden) hidden.value = items.map(function(item) { return item.key; }).join('\n');
        renderAddonOrderPicker(field);
    };

    window.resetAddonOrder = function(field) {
        var hidden = document.getElementById(field + '-order');
        if (hidden) hidden.value = '';
        renderAddonOrderPicker(field);
    };

    window.addExactRecipe = function(field) {
        var select = document.getElementById(field + '-exact-recipe');
        var recipeId = select ? select.value : '';
        if (!recipeId) return;
        var items = parseExactItems(field);
        if (!items.some(function(item) { return item.recipeId === recipeId; })) {
            items.push({ recipeId: recipeId });
            setExactItems(field, items);
        }
        renderExactItems(field);
    };

    window.addExactStatic = function(field) {
        var nameEl = document.getElementById(field + '-exact-name');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { showToast('Введите название добавки'); return; }
        var item = {
            name: name,
            amount: (document.getElementById(field + '-exact-amount') || {}).value || '',
            kcal: parseFloat((document.getElementById(field + '-exact-kcal') || {}).value) || 0,
            protein: parseFloat((document.getElementById(field + '-exact-protein') || {}).value) || 0,
            fat: parseFloat((document.getElementById(field + '-exact-fat') || {}).value) || 0,
            carbs: parseFloat((document.getElementById(field + '-exact-carbs') || {}).value) || 0,
            fiber: parseFloat((document.getElementById(field + '-exact-fiber') || {}).value) || 0
        };
        var items = parseExactItems(field);
        items.push(item);
        setExactItems(field, items);
        renderExactItems(field);
    };

    window.moveExactItem = function(field, index, dir) {
        var items = parseExactItems(field);
        var next = index + dir;
        if (next < 0 || next >= items.length) return;
        var tmp = items[index];
        items[index] = items[next];
        items[next] = tmp;
        setExactItems(field, items);
        renderExactItems(field);
    };

    window.removeExactItem = function(field, index) {
        var items = parseExactItems(field);
        items.splice(index, 1);
        setExactItems(field, items);
        renderExactItems(field);
    };

    var editingCategoryId = null;

    window.openCategoryModal = function() {
        editingCategoryId = null;
        document.getElementById('category-modal-title').textContent = 'Новая категория';
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-id').disabled = false;
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-emoji').value = '';
        document.getElementById('cat-color').value = '#999';
        document.getElementById('cat-sort').value = 0;
        document.getElementById('cat-desc').value = '';
        AA_SLOTS.forEach(function(s) {
            populateCatSelect(s.field, '', null);
            wireAddonOrderSelect(s);
            var orderEl = document.getElementById(s.field + '-order');
            if (orderEl) orderEl.value = '';
            setExactItems(s.field, []);
        });
        document.getElementById('cat-delete-btn').style.display = 'none';
        document.getElementById('category-modal').classList.add('open');
        renderAddonOrderPickers();
    };

    window.editCategory = function(id) {
        var c = allCategories.find(function(x) { return x.id === id; });
        if (!c) return;
        editingCategoryId = id;
        document.getElementById('category-modal-title').textContent = 'Редактировать: ' + c.name;
        document.getElementById('cat-id').value = c.id;
        document.getElementById('cat-id').disabled = true;
        document.getElementById('cat-name').value = c.name || '';
        document.getElementById('cat-emoji').value = c.emoji || '';
        document.getElementById('cat-color').value = c.color || '#999';
        document.getElementById('cat-sort').value = c.sort_order || 0;
        document.getElementById('cat-desc').value = c.description || '';
        var aa = c.auto_addons || {};
        AA_SLOTS.forEach(function(s) {
            var r = aa[s.key] || {};
            populateCatSelect(s.field, r.fromCategory || '', id);
            wireAddonOrderSelect(s);
            var orderEl = document.getElementById(s.field + '-order');
            if (orderEl) orderEl.value = formatAddonOrder(r.order);
            setExactItems(s.field, r.items || []);
        });
        document.getElementById('cat-delete-btn').style.display = 'inline-block';
        document.getElementById('category-modal').classList.add('open');
        renderAddonOrderPickers();
    };

    window.closeCategoryModal = function() {
        document.getElementById('category-modal').classList.remove('open');
    };

    window.saveCategory = function() {
        var body = {
            id: document.getElementById('cat-id').value.trim(),
            name: document.getElementById('cat-name').value.trim(),
            emoji: document.getElementById('cat-emoji').value.trim(),
            color: document.getElementById('cat-color').value.trim(),
            description: document.getElementById('cat-desc').value.trim(),
            sort_order: parseInt(document.getElementById('cat-sort').value) || 0,
            auto_addons: {}
        };
        AA_SLOTS.forEach(function(s) {
            var v = document.getElementById(s.field).value;
            var orderEl = document.getElementById(s.field + '-order');
            var order = parseAddonOrder(orderEl ? orderEl.value : '');
            var exactItems = parseExactItems(s.field);
            if (v || order.length || exactItems.length) {
                body.auto_addons[s.key] = {};
                if (v) body.auto_addons[s.key].fromCategory = v;
                if (order.length) body.auto_addons[s.key].order = order;
                if (exactItems.length) body.auto_addons[s.key].items = exactItems;
            }
        });
        if (!body.id || !body.name) { showToast('ID и название обязательны'); return; }
        var url = editingCategoryId ? '/admin/categories/' + editingCategoryId : '/admin/categories';
        var method = editingCategoryId ? 'PUT' : 'POST';
        api(url, { method: method, body: body }).then(function() {
            showToast('Сохранено');
            closeCategoryModal();
            loadCategoriesList();
            loadCategoriesMeta(); // refresh global CAT_NAMES + checkboxes
        }).catch(function(e) { showToast(e.message || 'Ошибка'); });
    };

    window.deleteCategory = function() {
        if (!editingCategoryId) return;
        if (!confirm('Удалить категорию «' + editingCategoryId + '»?')) return;
        api('/admin/categories/' + editingCategoryId, { method: 'DELETE' }).then(function() {
            showToast('Удалено');
            closeCategoryModal();
            loadCategoriesList();
            loadCategoriesMeta();
        }).catch(function(e) { showToast(e.message || 'Ошибка'); });
    };

    // ── Feedback ──────────────────────────────────────────────────────────────
    var allFeedback = [];
    var fbFilter = 'waiting_admin';
    var fbPage = 1;
    var fbHasMore = false;
    var FB_CAT_LABELS = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };

    window.loadFeedback = function(filter, append) {
        if (!append) {
            fbFilter = filter || 'all';
            fbPage = 1;
            allFeedback = [];
        }
        document.querySelectorAll('[id^="fb-filter-"]').forEach(function(b) {
            b.style.background = b.id === 'fb-filter-' + fbFilter ? 'var(--accent)' : '';
            b.style.color = b.id === 'fb-filter-' + fbFilter ? '#fff' : '';
        });
        var statusParam = fbFilter === 'all' ? '' : '&status=' + fbFilter;
        api('/admin/feedback?page=' + fbPage + '&limit=20' + statusParam).then(function(data) {
            allFeedback = allFeedback.concat(data.rows);
            fbHasMore = data.hasMore;
            // badge
            var badge = document.getElementById('feedback-badge');
            if (data.totalNew > 0) { badge.textContent = data.totalNew; badge.style.display = 'inline'; }
            else { badge.style.display = 'none'; }
            renderFeedback(allFeedback);
        });
    };

    window.loadMoreFeedback = function() {
        fbPage++;
        loadFeedback(fbFilter, true);
    };

    var FB_STATUS_BADGE = {
        waiting_admin: { cls: 'st-trial', label: 'Ждёт ответа' },
        new:           { cls: 'st-trial', label: 'Новое' },
        waiting_user:  { cls: 'st-confirmed', label: 'Юлия ответила' },
        answered:      { cls: 'st-confirmed', label: 'Отвечено' },
        closed:        { cls: '', label: 'Решено' }
    };

    function renderFeedbackThreadHtml(messages) {
        if (!messages || !messages.length) return '';
        return messages.map(function(m) {
            var isUser = m.sender_type === 'user';
            var who = isUser ? 'Пользователь' : 'Юлия';
            var bg = isUser ? '#faf9f6' : '#edf6ee';
            var fg = isUser ? '#6b6b6b' : '#476b4c';
            return '<div style="margin-bottom:8px;padding:10px;background:' + bg + ';border-radius:8px;font-size:13px;color:#333;line-height:1.5">'
                + '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px">'
                + '<strong style="font-size:11px;color:' + fg + ';text-transform:uppercase;letter-spacing:.05em">' + who + '</strong>'
                + '<span style="font-size:11px;color:#777">' + fmtDateTime(m.created_at) + '</span>'
                + '</div>'
                + '<div style="white-space:pre-wrap">' + esc(m.text) + '</div>'
                + '</div>';
        }).join('');
    }

    function renderFeedback(items) {
        var el = document.getElementById('feedback-list');
        if (!items.length) { el.innerHTML = '<div class="adm-empty">Нет обращений</div>'; return; }
        var html = items.map(function(f) {
            var catLabel = FB_CAT_LABELS[f.category] || f.category;
            var st = FB_STATUS_BADGE[f.status] || { cls: '', label: f.status };
            var statusBadge = '<span class="st-badge ' + st.cls + '">' + st.label + '</span>';
            var hiddenBadge = f.user_deleted_at
                ? '<span class="st-badge" style="background:#e8e6e0;color:#6b6b6b" title="Пользователь скрыл обращение из своего ЛК. В базе оно сохранено.">Скрыто пользователем</span>'
                : '';
            var threadHtml = renderFeedbackThreadHtml(f.messages);
            var needsReply = (f.status === 'waiting_admin' || f.status === 'new');
            var isClosed = f.status === 'closed';
            var actions = '';
            if (!isClosed) {
                var actionLabel = needsReply ? 'Ответить' : 'Дописать';
                var actionCls = needsReply ? 'adm-btn adm-btn-confirm' : 'adm-btn';
                actions = '<button class="' + actionCls + '" onclick="openFbReply(' + f.id + ')" style="font-size:12px;padding:6px 12px">' + actionLabel + '</button>';
            }
            var msgCount = (f.msg_count != null ? f.msg_count : (f.messages ? f.messages.length : 0));
            var msgCountLabel = msgCount > 1 ? ' · ' + msgCount + ' сообщ.' : '';
            var rowStyle = f.user_deleted_at
                ? 'padding:14px;border:1px dashed var(--border);border-radius:10px;margin-bottom:8px;background:#faf9f6;opacity:.85'
                : 'padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff';
            if (needsReply) rowStyle += ';border-left:3px solid var(--accent)';
            var lastUpdate = f.updated_at || f.created_at;
            return '<div style="' + rowStyle + '">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">'
                + '<div><strong style="font-size:13px">' + esc(f.display_name || f.email) + '</strong>' + (f.display_name ? '<br><span style="font-size:11px;color:var(--text-3)">' + esc(f.email) + '</span>' : '') + ' · <span style="font-size:12px;color:var(--text-3)">' + catLabel + msgCountLabel + '</span></div>'
                + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + statusBadge + hiddenBadge + '<span style="font-size:11px;color:var(--text-3)">' + fmtDateTime(lastUpdate) + '</span></div>'
                + '</div>'
                + threadHtml
                + '<div style="margin-top:10px">' + actions + '</div>'
                + '</div>';
        }).join('');
        if (fbHasMore) {
            html += '<div style="text-align:center;margin:16px 0"><button class="adm-btn" onclick="loadMoreFeedback()" style="padding:8px 24px">Загрузить ещё</button></div>';
        }
        el.innerHTML = html;
    }

    window.openFbReply = function(id) {
        var f = allFeedback.find(function(x) { return x.id === id; });
        if (!f) return;
        if (f.status === 'closed') {
            showToast('Обращение закрыто пользователем — ответить нельзя');
            return;
        }
        document.getElementById('fb-reply-id').value = id;
        document.getElementById('fb-reply-original').innerHTML =
            '<strong>' + esc(f.display_name || f.email) + '</strong>' + (f.display_name ? '<br><span style="font-size:11px;color:var(--text-3)">' + esc(f.email) + '</span>' : '') + ' · ' + (FB_CAT_LABELS[f.category] || f.category);
        document.getElementById('fb-reply-thread').innerHTML = renderFeedbackThreadHtml(f.messages);
        document.getElementById('fb-reply-text').value = '';
        document.getElementById('fb-reply-modal').classList.add('open');
    };

    window.closeFbReplyModal = function() {
        document.getElementById('fb-reply-modal').classList.remove('open');
    };

    window.submitFbReply = function() {
        var id = document.getElementById('fb-reply-id').value;
        var text = document.getElementById('fb-reply-text').value.trim();
        if (!text) { document.getElementById('fb-reply-text').focus(); return; }
        var btn = document.getElementById('fb-reply-submit');
        btn.disabled = true; btn.textContent = 'Отправка...';
        api('/admin/feedback/' + id + '/reply', {
            method: 'POST',
            body: { reply: text }
        }).then(function() {
            closeFbReplyModal();
            showToast('Ответ отправлен');
            loadFeedback(fbFilter);
        }).catch(function() {
            showToast('Ошибка');
        }).finally(function() {
            btn.disabled = false;
            btn.textContent = 'Отправить ответ';
        });
    };

    // ── Audit log ──
    var auditRows = [];
    var auditPage = 1;
    var auditHasMore = false;
    var EVENT_LABELS = {
        login: '🔑 Вход',
        register: '📝 Регистрация',
        trial_granted: '✅ Триал выдан',
        trial_denied: '🚫 Триал отказан',
        login_blocked: '⛔ Вход заблок.',
        payment_confirm: '💰 Платёж подтв.',
        payment_reject: '❌ Платёж откл.',
        user_block: '🔒 Блокировка',
        user_unblock: '🔓 Разблокировка'
    };

    window.loadAudit = function(append) {
        if (!append) {
            auditPage = 1;
            auditRows = [];
        }
        var filter = document.getElementById('audit-filter').value;
        var url = '/admin/audit?page=' + auditPage + '&limit=50' + (filter ? '&event=' + filter : '');
        api(url).then(function(data) {
            auditRows = auditRows.concat(data.rows);
            auditHasMore = data.hasMore;
            renderAudit(auditRows);
        });
    };

    window.loadMoreAudit = function() {
        auditPage++;
        loadAudit(true);
    };

    function renderAudit(rows) {
        var tbody = document.getElementById('audit-tbody');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="adm-empty">Нет событий</td></tr>';
            return;
        }
        var html = rows.map(function(e) {
            var label = EVENT_LABELS[e.event] || e.event;
            var badgeClass = 'st-active';
            if (e.event.includes('denied') || e.event.includes('blocked') || e.event.includes('reject') || e.event.includes('block')) badgeClass = 'st-rejected';
            else if (e.event === 'register' || e.event === 'trial_granted') badgeClass = 'st-trial';
            else if (e.event.includes('confirm') || e.event.includes('unblock')) badgeClass = 'st-confirmed';
            return '<tr>' +
                '<td class="adm-date">' + fmtDateTime(e.created_at) + '</td>' +
                '<td><span class="st-badge ' + badgeClass + '">' + label + '</span></td>' +
                '<td>' + esc(e.email) + '</td>' +
                '<td style="font-size:12px;color:var(--text-3)">' + esc(e.detail) + '</td>' +
                '<td style="font-size:12px;color:var(--text-3)">' + esc(e.ip) + '</td>' +
                '</tr>';
        }).join('');
        if (auditHasMore) {
            html += '<tr><td colspan="5" style="text-align:center;padding:12px"><button class="adm-btn" onclick="loadMoreAudit()" style="padding:8px 24px">Загрузить ещё</button></td></tr>';
        }
        tbody.innerHTML = html;
    }

    // ── Init ──
    loadStats();
    var initialTab = new URLSearchParams(location.search).get('tab');
    if (initialTab && document.querySelector('[data-tab="' + initialTab + '"]')) {
        switchTab(initialTab);
    }
})();
