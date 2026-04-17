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
                if (res.status === 401) {
                    return Auth.refreshToken().then(function(ok) {
                        if (ok) {
                            opts.headers['Authorization'] = 'Bearer ' + Auth.getToken();
                            return fetch(API_BASE + path, opts).then(function(r2) {
                                if (r2.status === 401) { location.href = 'login.html?return=admin.html'; }
                                if (r2.status === 403) { showToast('Нет прав администратора'); throw new Error('403'); }
                                if (r2.status === 429) { showToast('Слишком много запросов, подождите'); throw new Error('429'); }
                                return r2.json();
                            });
                        }
                        location.href = 'login.html?return=admin.html';
                    });
                }
                if (res.status === 403) { showToast('Нет прав администратора'); throw new Error('403'); }
                if (res.status === 429) { showToast('Слишком много запросов, подождите'); throw new Error('429'); }
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
        if (tab === 'feedback') loadFeedback('new');
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
                actions = '<button class="adm-btn adm-btn-extend" onclick="openExtendModal(\'' + u.id + '\',\'' + esc(u.email) + '\',\'' + (u.active_until || '') + '\')">Продлить</button>' +
                    '<button class="adm-btn adm-btn-block" onclick="blockUser(\'' + u.id + '\',\'' + esc(u.email) + '\')">Блок</button>';
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

    window.blockUser = function(id, email) {
        if (!confirm('Заблокировать ' + email + '?')) return;
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
    window.openExtendModal = function(id, email, activeUntil) {
        extendUserId = id;
        document.getElementById('extend-user-email').textContent = email || '';
        var untilEl = document.getElementById('extend-current-until');
        if (activeUntil) {
            var until = new Date(activeUntil);
            var now = new Date();
            untilEl.textContent = until > now
                ? 'Активна до: ' + fmtDate(activeUntil)
                : 'Истекла: ' + fmtDate(activeUntil);
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
        }).catch(function() {
            showToast('Ошибка');
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
        var comment = prompt('Причина (необязательно):', '');
        api('/admin/payments/' + id + '/reject', {
            method: 'POST',
            body: { comment: comment || 'Отклонено' }
        }).then(function() {
            showToast('Платёж отклонён');
            loadPayments('pending');
            loadStats();
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
        if (!s) return '';
        var el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
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
                + '<button class="adm-btn adm-btn-reject" onclick="deleteNews(' + n.id + ')" style="font-size:12px;padding:6px 10px">✕</button>'
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

    function loadCategoriesMeta() {
        return api('/content/categories').then(function(cats) {
            allCategories = cats || [];
            CAT_NAMES = {};
            allCategories.forEach(function(c) { CAT_NAMES[c.id] = c.name; });
            // Populate recipe-cat checkboxes (used by quick-add modal)
            var box = document.getElementById('recipe-cat');
            if (box) {
                box.innerHTML = allCategories.map(function(c) {
                    return '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:12px">' +
                        '<input type="checkbox" value="' + c.id + '"> ' + esc(c.name) + '</label>';
                }).join('');
            }
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
        var filtered = allRecipes.filter(function(r) {
            var rc = r.categories || (r.cat ? [r.cat] : []);
            if (recipeCatFilter !== 'all' && rc.indexOf(recipeCatFilter) === -1) return false;
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
                badge = '<span class="rbadge rbadge-draft">Черновик</span>';
            } else if (r.is_free) {
                badge = '<span class="rbadge rbadge-trial">Trial</span>';
            } else {
                badge = '<span class="rbadge rbadge-pro">Pro</span>';
            }
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text)">' + badge + '<span>' + (r.emoji || '') + ' ' + esc(r.name) + '</span></div>'
                + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">' + (r.categories || [r.cat]).map(function(c) { return CAT_NAMES[c] || c; }).join(', ') + ' · ' + r.time_min + ' мин · ' + r.kcal + ' ккал</div>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">'
                + '<button class="adm-btn" onclick="openRecipeEditor(\'' + r.id + '\')" style="font-size:12px;padding:6px 10px" title="Открыть в редакторе">✏️</button>'
                + '<button class="adm-btn adm-btn-reject" onclick="deleteRecipe(\'' + r.id + '\')" style="font-size:12px;padding:6px 10px">✕</button>'
                + '</div></div>';
        }).join('');
    }

    window.filterRecipes = function() {
        applyRecipeFilters();
    };

    window.openRecipeModal = function(r) {
        document.getElementById('recipe-modal-title').textContent = r ? 'Редактировать рецепт' : 'Новый рецепт';
        document.getElementById('recipe-edit-id').value = r ? r.id : '';
        document.getElementById('recipe-id').value = r ? r.id : '';
        document.getElementById('recipe-id').disabled = !!r;
        var cats = r ? (r.categories || (r.cat ? [r.cat] : ['breakfasts'])) : ['breakfasts'];
        document.querySelectorAll('#recipe-cat input[type=checkbox]').forEach(function(c) { c.checked = cats.indexOf(c.value) !== -1; });
        document.getElementById('recipe-name').value = r ? r.name : '';
        document.getElementById('recipe-emoji').value = r ? (r.emoji || '🍴') : '🍴';
        document.getElementById('recipe-time').value = r ? r.time_min : 30;
        document.getElementById('recipe-diff').value = r ? r.difficulty : 'easy';
        document.getElementById('recipe-servings').value = r ? r.servings : 4;
        document.getElementById('recipe-portion-grams').value = r ? (r.portion_grams || 300) : 300;
        document.getElementById('recipe-kcal').value = r ? r.kcal : 0;
        document.getElementById('recipe-protein').value = r ? r.protein : 0;
        document.getElementById('recipe-fat').value = r ? r.fat : 0;
        document.getElementById('recipe-carbs').value = r ? r.carbs : 0;
        document.getElementById('recipe-fiber').value = r ? r.fiber : 0;
        document.getElementById('recipe-photo').value = r ? (r.photo || '') : '';
        document.getElementById('recipe-quote').value = r ? (r.quote || '') : '';
        document.getElementById('recipe-note').value = r ? (r.note || '') : '';
        document.getElementById('recipe-tags').value = r ? (r.tags || []).join(', ') : '';
        document.getElementById('recipe-yt-video').value = r ? (r.yt_video || '') : '';
        document.getElementById('recipe-vk-video').value = r ? (r.vk_video || '') : '';
        document.getElementById('recipe-dzen-video').value = r ? (r.dzen_video || '') : '';
        document.getElementById('recipe-free').checked = r ? r.is_free : false;
        document.getElementById('recipe-published').checked = r ? r.is_published : true;
        // Add-panels (serialize objects to line format: name | kcal | protein | fat | carbs | fiber [| @recipeId])
        function addItemsToText(items) {
            if (!items || !items.length) return '';
            return items.map(function(it) {
                if (typeof it === 'string') return it;
                var line = (it.name||'') + ' | ' + (it.kcal||0) + ' | ' + (it.protein||0) + ' | ' + (it.fat||0) + ' | ' + (it.carbs||0) + ' | ' + (it.fiber||0);
                if (it.recipeId) line += ' | @' + it.recipeId;
                return line;
            }).join('\n');
        }
        document.getElementById('recipe-add-protein').value = addItemsToText(r ? r.add_protein : []);
        document.getElementById('recipe-add-fat').value = addItemsToText(r ? r.add_fat : []);
        document.getElementById('recipe-add-carbs').value = addItemsToText(r ? r.add_carbs : []);
        document.getElementById('recipe-add-fiber').value = addItemsToText(r ? r.add_fiber : []);
        // Ingredients
        var ingr = r ? (r.ingredients || []) : [];
        document.getElementById('recipe-ingredients').value = ingr.map(function(i) {
            return typeof i === 'string' ? i : (i.name || '') + (i.swap ? ' | ' + i.swap : '');
        }).join('\n');
        // Steps: объектные шаги сериализуем как JSON-строки, простые — как есть
        var steps = r ? (r.steps || []) : [];
        document.getElementById('recipe-steps').value = steps.map(function(s) {
            if (typeof s === 'string') return s;
            return JSON.stringify(s);
        }).join('\n');
        document.getElementById('recipe-modal').classList.add('open');
    };

    window.closeRecipeModal = function() { document.getElementById('recipe-modal').classList.remove('open'); };

    window.editRecipe = function(id) {
        var r = allRecipes.find(function(x) { return x.id === id; });
        if (r) openRecipeModal(r);
    };

    window.openRecipeEditor = function(id) {
        location.href = 'recipe-editor.html' + (id ? '?id=' + encodeURIComponent(id) : '');
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
                if (!r || !r.fromCategory) return '';
                var name = CAT_NAMES[r.fromCategory] || r.fromCategory;
                return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;margin:2px 2px 0 0">' + s.label + ' ← ' + esc(name) + '</span>';
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
        AA_SLOTS.forEach(function(s) { populateCatSelect(s.field, '', null); });
        document.getElementById('cat-delete-btn').style.display = 'none';
        document.getElementById('category-modal').classList.add('open');
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
        });
        document.getElementById('cat-delete-btn').style.display = 'inline-block';
        document.getElementById('category-modal').classList.add('open');
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
            if (v) body.auto_addons[s.key] = { fromCategory: v };
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

    // Parse add-panel textarea: "name | kcal | protein | fat | carbs | fiber [| @recipeId]"
    function parseAddItems(elId) {
        return document.getElementById(elId).value.split('\n').filter(function(l) { return l.trim(); }).map(function(line) {
            var parts = line.split('|').map(function(s) { return s.trim(); });
            var obj = { name: parts[0] || '' };
            if (parts.length >= 6) {
                obj.kcal = parseFloat(parts[1]) || 0;
                obj.protein = parseFloat(parts[2]) || 0;
                obj.fat = parseFloat(parts[3]) || 0;
                obj.carbs = parseFloat(parts[4]) || 0;
                obj.fiber = parseFloat(parts[5]) || 0;
            }
            // Check for recipe reference: @recipeId
            var last = parts[parts.length - 1];
            if (last && last.charAt(0) === '@') {
                obj.recipeId = last.substring(1);
            }
            return obj;
        });
    }

    window.saveRecipe = function() {
        var editId = document.getElementById('recipe-edit-id').value;
        var ingrLines = document.getElementById('recipe-ingredients').value.split('\n').filter(function(l) { return l.trim(); });
        var ingredients = ingrLines.map(function(l) {
            var parts = l.split('|');
            return { name: parts[0].trim(), swap: parts[1] ? parts[1].trim() : null };
        });
        var steps = document.getElementById('recipe-steps').value.split('\n').filter(function(l) { return l.trim(); }).map(function(l) {
            var trimmed = l.trim();
            // Если строка начинается с { — пробуем распарсить как JSON (объектный шаг с фото)
            if (trimmed.charAt(0) === '{') {
                try { return JSON.parse(trimmed); } catch(e) { /* не JSON — оставляем строкой */ }
            }
            return trimmed;
        });
        var tags = document.getElementById('recipe-tags').value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
        var body = {
            id: document.getElementById('recipe-id').value.trim(),
            categories: Array.prototype.map.call(document.querySelectorAll('#recipe-cat input[type=checkbox]:checked'), function(c) { return c.value; }),
            cat: (document.querySelector('#recipe-cat input[type=checkbox]:checked') || {}).value || 'breakfasts',
            name: document.getElementById('recipe-name').value.trim(),
            emoji: document.getElementById('recipe-emoji').value || '🍴',
            time_min: parseInt(document.getElementById('recipe-time').value) || 30,
            difficulty: document.getElementById('recipe-diff').value,
            servings: parseInt(document.getElementById('recipe-servings').value) || 4,
            portion_grams: parseInt(document.getElementById('recipe-portion-grams').value) || 300,
            kcal: parseInt(document.getElementById('recipe-kcal').value) || 0,
            protein: parseFloat(document.getElementById('recipe-protein').value) || 0,
            fat: parseFloat(document.getElementById('recipe-fat').value) || 0,
            carbs: parseFloat(document.getElementById('recipe-carbs').value) || 0,
            fiber: parseFloat(document.getElementById('recipe-fiber').value) || 0,
            photo: document.getElementById('recipe-photo').value.trim() || null,
            quote: document.getElementById('recipe-quote').value.trim() || null,
            note: document.getElementById('recipe-note').value.trim() || null,
            tags: tags,
            yt_video: document.getElementById('recipe-yt-video').value.trim() || null,
            vk_video: document.getElementById('recipe-vk-video').value.trim() || null,
            dzen_video: document.getElementById('recipe-dzen-video').value.trim() || null,
            is_free: document.getElementById('recipe-free').checked,
            is_published: document.getElementById('recipe-published').checked,
            ingredients: ingredients,
            steps: steps,
            add_protein: parseAddItems('recipe-add-protein'),
            add_fat: parseAddItems('recipe-add-fat'),
            add_carbs: parseAddItems('recipe-add-carbs'),
            add_fiber: parseAddItems('recipe-add-fiber')
        };
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/admin/recipes/' + editId : '/admin/recipes';
        api(url, { method: method, body: body }).then(function(res) {
            if (res.error) { showToast(res.error); return; }
            closeRecipeModal();
            showToast('Сохранено');
            loadRecipesList();
        }).catch(function() { showToast('Ошибка'); });
    };

    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Feedback ──────────────────────────────────────────────────────────────
    var allFeedback = [];
    var fbFilter = 'new';
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

    function renderFeedback(items) {
        var el = document.getElementById('feedback-list');
        if (!items.length) { el.innerHTML = '<div class="adm-empty">Нет обращений</div>'; return; }
        var html = items.map(function(f) {
            var catLabel = FB_CAT_LABELS[f.category] || f.category;
            var statusBadge = f.status === 'answered'
                ? '<span class="st-badge st-confirmed">Отвечено</span>'
                : '<span class="st-badge st-trial">Новое</span>';
            var replyBlock = '';
            if (f.admin_reply) {
                replyBlock = '<div style="margin-top:10px;padding:10px;background:#edf6ee;border-radius:8px;font-size:13px;color:#333;line-height:1.5">'
                    + '<strong style="font-size:11px;color:#476b4c;text-transform:uppercase;letter-spacing:.05em">Ответ:</strong><br>'
                    + esc(f.admin_reply)
                    + '<div style="font-size:11px;color:#777;margin-top:6px">' + fmtDateTime(f.admin_replied_at) + '</div>'
                    + '</div>';
            }
            var actions = f.status === 'new'
                ? '<button class="adm-btn adm-btn-confirm" onclick="openFbReply(' + f.id + ')" style="font-size:12px;padding:6px 12px">Ответить</button>'
                : '<button class="adm-btn" onclick="openFbReply(' + f.id + ')" style="font-size:12px;padding:6px 12px">Изменить ответ</button>';
            return '<div style="padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
                + '<div><strong style="font-size:13px">' + esc(f.display_name || f.email) + '</strong>' + (f.display_name ? '<br><span style="font-size:11px;color:var(--text-3)">' + esc(f.email) + '</span>' : '') + ' · <span style="font-size:12px;color:var(--text-3)">' + catLabel + '</span></div>'
                + '<div style="display:flex;align-items:center;gap:8px">' + statusBadge + '<span style="font-size:11px;color:var(--text-3)">' + fmtDateTime(f.created_at) + '</span></div>'
                + '</div>'
                + '<div style="font-size:14px;color:var(--text);line-height:1.6;white-space:pre-wrap">' + esc(f.text) + '</div>'
                + replyBlock
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
        document.getElementById('fb-reply-id').value = id;
        document.getElementById('fb-reply-original').innerHTML =
            '<strong>' + esc(f.display_name || f.email) + '</strong>' + (f.display_name ? '<br><span style="font-size:11px;color:var(--text-3)">' + esc(f.email) + '</span>' : '') + ' · ' + (FB_CAT_LABELS[f.category] || f.category)
            + '<br><br>' + esc(f.text);
        document.getElementById('fb-reply-text').value = f.admin_reply || '';
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
})();
