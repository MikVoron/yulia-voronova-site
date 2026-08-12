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
    var recipeCategoryOrder = { categoryId: '', recipes: [], draggingId: '' };

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
    var ADMIN_TABS = ['dashboard', 'users', 'payments', 'news', 'recipes', 'video-requests', 'categories', 'feedback', 'audit'];

    function normalizeAdminTab(tab) {
        return ADMIN_TABS.includes(tab) ? tab : 'users';
    }

    window.switchTab = function(tab) {
        tab = normalizeAdminTab(tab);
        document.querySelectorAll('.adm-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
        document.querySelectorAll('.adm-section').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('sec-' + tab).classList.add('active');

        if (tab === 'users' && !allUsers.length) loadUsers();
        if (tab === 'payments') { loadPayments('pending'); loadEarlyAccessState(); }
        if (tab === 'news') loadNews();
        if (tab === 'recipes') loadRecipesList();
        if (tab === 'video-requests') loadVideoRequests();
        if (tab === 'categories') loadCategoriesList();
        if (tab === 'feedback') loadFeedback('waiting_admin');
        if (tab === 'audit') loadAudit();
        loadStats();
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

    // Badge: recipes that have reached the goal and still need scheduling.
    loadVideoRequests(true);

    function loadStats() {
        api('/admin/stats').then(function(data) {
            var grid = document.getElementById('stats-grid');
            grid.innerHTML =
                statCard('Всего', data.totalUsers, 'accent') +
                statCard('Trial', data.trials, 'blue-l') +
                statCard('Активных', data.active, 'green') +
                statCard('Активны за 7 дней', data.activeUsers7d || 0, 'blue-l') +
                statCard('Активны за 30 дней', data.activeUsers30d || 0, 'blue-l') +
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
            tbody.innerHTML = '<tr><td colspan="7" class="adm-empty">Нет пользователей</td></tr>';
            return;
        }
        tbody.innerHTML = users.map(function(u) {
            var isAdmin = u.role === 'admin';
            var status = isAdmin ? 'admin' : (u.sub_status || 'нет');
            var statusClass = isAdmin ? 'st-active' : ('st-' + cssToken(status));
            var untilDate = '';
            if (isAdmin) untilDate = '∞';
            else if (u.sub_status === 'trial' && u.trial_ends_at) untilDate = fmtDate(u.trial_ends_at);
            else if (u.sub_status === 'active' && u.active_until) untilDate = fmtDate(u.active_until);
            var activity = formatUserActivity(u);

            var primaryActions = '<button class="adm-btn" data-admin-action="compose-message" data-admin-id="' + esc(u.id) + '" title="Написать пользователю">Написать</button>';
            var secondaryActions = '';
            if (u.is_blocked) {
                primaryActions += '<button class="adm-btn adm-btn-unblock" data-admin-action="unblock-user" data-admin-id="' + esc(u.id) + '">Разблокировать</button>';
                secondaryActions = '<button class="adm-btn adm-btn-delete" data-admin-action="delete-user" data-admin-id="' + esc(u.id) + '">Удалить</button>';
            } else if (u.role !== 'admin') {
                primaryActions += '<button class="adm-btn adm-btn-extend" data-admin-action="extend-user" data-admin-id="' + esc(u.id) + '">Продлить</button>';
                secondaryActions = '<button class="adm-btn adm-btn-block" data-admin-action="block-user" data-admin-id="' + esc(u.id) + '">Заблокировать</button>' +
                    '<button class="adm-btn adm-btn-delete" data-admin-action="delete-user" data-admin-id="' + esc(u.id) + '">Удалить</button>';
            }
            var actions = '<div class="adm-user-actions"><div class="adm-user-actions-primary">' + primaryActions + '</div>' +
                (secondaryActions ? '<div class="adm-user-actions-danger">' + secondaryActions + '</div>' : '') + '</div>';

            return '<tr>' +
                '<td><strong>' + esc(u.email || '—') + '</strong></td>' +
                '<td>' + esc(u.display_name || '—') + '</td>' +
                '<td><span class="st-badge ' + statusClass + '">' + esc(status) + '</span></td>' +
                '<td class="adm-date">' + esc(untilDate) + '</td>' +
                '<td class="adm-date">' + fmtDate(u.created_at) + '</td>' +
                '<td>' + activity + '</td>' +
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

    var personalMessageUser = null;
    window.openPersonalMessageModalById = function(id) {
        var u = findUserById(id);
        if (!u || !u.email) { showToast('Пользователь не найден'); return; }
        personalMessageUser = u;
        document.getElementById('personal-message-recipient').textContent = u.email;
        document.getElementById('personal-message-sender').value = 'yulia';
        document.getElementById('personal-message-subject').value = '';
        document.getElementById('personal-message-text').value = '';
        document.getElementById('personal-message-modal').classList.add('open');
        setTimeout(function() { document.getElementById('personal-message-subject').focus(); }, 0);
    };

    window.closePersonalMessageModal = function() {
        document.getElementById('personal-message-modal').classList.remove('open');
        personalMessageUser = null;
    };

    function personalMessagePayload(preview) {
        if (!personalMessageUser) { showToast('Пользователь не выбран'); return null; }
        var subject = document.getElementById('personal-message-subject').value.trim();
        var text = document.getElementById('personal-message-text').value.trim();
        if (!subject) { showToast('Укажите тему письма'); document.getElementById('personal-message-subject').focus(); return null; }
        if (!text) { showToast('Введите текст письма'); document.getElementById('personal-message-text').focus(); return null; }
        return {
            email: personalMessageUser.email,
            sender: document.getElementById('personal-message-sender').value,
            subject: subject,
            text: text,
            preview: !!preview
        };
    }

    window.previewPersonalMessage = function() {
        var payload = personalMessagePayload(true);
        if (!payload) return;
        var button = document.getElementById('personal-message-preview-btn');
        button.disabled = true;
        button.textContent = 'Собираем…';
        api('/admin/personal-messages', { method: 'POST', body: payload }).then(function(data) {
            document.getElementById('personal-message-preview-frame').srcdoc = data.html;
            document.getElementById('personal-message-preview-modal').classList.add('open');
        }).catch(function(e) {
            showToast(e.message || 'Не удалось собрать предпросмотр');
        }).finally(function() {
            button.disabled = false;
            button.textContent = 'Предпросмотр';
        });
    };

    window.closePersonalMessagePreview = function() {
        document.getElementById('personal-message-preview-modal').classList.remove('open');
    };

    window.sendPersonalMessage = function() {
        var payload = personalMessagePayload(false);
        if (!payload) return;
        if (!confirm('Отправить письмо на ' + payload.email + '?')) return;
        var button = document.getElementById('personal-message-submit');
        button.disabled = true;
        button.textContent = 'Отправка…';
        api('/admin/personal-messages', { method: 'POST', body: payload }).then(function(data) {
            closePersonalMessageModal();
            if (data.sentCopy && data.sentCopy.saved) {
                showToast('Письмо отправлено и сохранено в «Отправленных»: ' + data.email);
            } else {
                showToast('Письмо отправлено, но копия не сохранена в «Отправленных». Проверьте IMAP-настройку.');
            }
        }).catch(function(e) {
            showToast(e.message || 'Не удалось отправить письмо');
        }).finally(function() {
            button.disabled = false;
            button.textContent = 'Отправить письмо';
        });
    };

    window.blockUserById = function(id) {
        var u = findUserById(id);
        if (!u) { showToast('Пользователь не найден'); return; }
        if (!confirm('Заблокировать ' + (u.email || '') + '?')) return;
        api('/admin/users/' + encodeURIComponent(id) + '/block', { method: 'POST' }).then(function() {
            showToast('Пользователь заблокирован');
            loadUsers();
            loadStats();
        });
    };

    window.unblockUser = function(id) {
        api('/admin/users/' + encodeURIComponent(id) + '/unblock', { method: 'POST' }).then(function() {
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
        api('/admin/users/' + encodeURIComponent(extendUserId) + '/extend', {
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
    window.loadEarlyAccessState = function() {
        api('/admin/early-access').then(function(data) {
            var el = document.getElementById('early-access-admin-state');
            if (el) el.textContent = 'Подтверждённых участников: ' + data.confirmedMembers + ' из ' + data.limit + ' · резерв вручную: ' + (data.manualReserved > 0 ? '+' : '') + data.manualReserved + ' · доступно: ' + data.remaining;
        }).catch(function() {});
    };
    window.saveEarlyAccessAdjustment = function() {
        var delta = Number(document.getElementById('early-access-delta').value);
        var comment = document.getElementById('early-access-comment').value.trim();
        api('/admin/early-access/adjustments', { method: 'POST', body: { slotsDelta: delta, comment: comment } }).then(function(data) {
            document.getElementById('early-access-delta').value = '';
            document.getElementById('early-access-comment').value = '';
            showToast('Корректировка сохранена');
            loadEarlyAccessState();
        }).catch(function(e) { showToast(e.message || 'Не удалось сохранить корректировку'); });
    };
    window.loadPayments = function(status) {
        document.querySelectorAll('[id^="pay-filter-"]').forEach(function(b) {
            b.style.background = b.id === 'pay-filter-' + status ? 'var(--accent)' : '';
            b.style.color = b.id === 'pay-filter-' + status ? '#fff' : '';
        });

        api('/admin/payments?status=' + encodeURIComponent(status)).then(function(data) {
            var tbody = document.getElementById('payments-tbody');
            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="adm-empty">Нет платежей со статусом "' + esc(status) + '"</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(function(p) {
                var statusBadge = '<span class="st-badge st-' + cssToken(p.status) + '">' + esc(p.status) + '</span>';
                var actions = '';
                if (p.status === 'pending') {
                    actions =
                        '<button class="adm-btn adm-btn-confirm" data-admin-action="confirm-payment" data-admin-id="' + esc(p.id) + '">OK</button>' +
                        '<button class="adm-btn adm-btn-reject" data-admin-action="reject-payment" data-admin-id="' + esc(p.id) + '">X</button>';
                } else if (p.admin_comment) {
                    actions = '<span style="font-size:11px;color:var(--text-3)">' + esc(p.admin_comment) + '</span>';
                }

                var screenCol = p.has_screenshot
                    ? '<a href="#" data-admin-action="show-screenshot" data-admin-id="' + esc(p.id) + '" style="color:var(--blue);font-size:12px">📎 Открыть</a>'
                    : '<span style="color:var(--text-3);font-size:12px">—</span>';

                return '<tr>' +
                    '<td><strong>' + esc(p.email) + '</strong></td>' +
                    '<td>' + esc(p.amount) + ' &#8381;</td>' +
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

    window.deleteUserById = function(id) {
        var u = findUserById(id);
        if (!u) { showToast('Пользователь не найден'); return; }
        var email = u.email || '';
        var typed = prompt(
            'Удаление необратимо. Будут удалены аккаунт, подписка и данные Тарелки.\n\n' +
            'Для подтверждения введите email пользователя:\n' + email
        );
        if (typed === null) return;
        if (typed.trim().toLowerCase() !== email.trim().toLowerCase()) {
            showToast('Email не совпадает. Удаление отменено');
            return;
        }
        api('/admin/users/' + encodeURIComponent(id), {
            method: 'DELETE',
            body: { confirmEmail: typed.trim() }
        }).then(function() {
            showToast('Пользователь удалён');
            loadUsers();
            loadStats();
        }).catch(function(e) {
            showToast(e.message || 'Не удалось удалить пользователя');
        });
    };

    // ── Helpers ──
    const ADMIN_TIME_ZONE = 'Europe/Moscow';
    function fmtDate(d) {
        if (!d) return '—';
        var date = new Date(d);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ADMIN_TIME_ZONE
        });
    }
    function fmtDateTime(d, timeSource) {
        if (!d) return '—';
        var date = new Date(d);
        var dateStr = date.toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ADMIN_TIME_ZONE
        });
        // Если payment_date — это просто дата без времени, берём время из created_at
        var tSrc = timeSource ? new Date(timeSource) : date;
        var timeStr = tSrc.toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit', timeZone: ADMIN_TIME_ZONE
        });
        return dateStr + ' ' + timeStr;
    }
    function formatUserActivity(user) {
        var lastActivity = user.last_activity_at
            ? 'Последняя активность: ' + fmtDateTime(user.last_activity_at)
            : 'Активности пока нет';
        var activeDays7d = Number(user.active_days_7d || 0);
        var activeDays30d = Number(user.active_days_30d || 0);
        return '<div style="font-size:12px;line-height:1.45">' +
            '<div>' + esc(lastActivity) + '</div>' +
            '<div style="color:var(--text-3)">Активных дней: ' + activeDays7d + ' за 7 дней · ' + activeDays30d + ' за 30 дней</div>' +
            '</div>';
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

    function cssToken(s) {
        return String(s == null ? '' : s).replace(/[^a-z0-9_-]/gi, '');
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
            var kind = n.type === 'recipe' ? 'Рецепт: ' + esc(n.recipe_id || '') : 'Текст';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="font-size:13px;color:var(--text);line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(n.text) + '</div>'
                + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">' + esc(d) + ' · ' + kind + ' · ' + status + '</div>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">'
                + '<button class="adm-btn" data-admin-action="edit-news" data-admin-id="' + Number(n.id) + '" style="font-size:12px;padding:6px 10px">✏️</button>'
                + '<button class="adm-btn adm-btn-reject" data-admin-action="delete-news" data-admin-id="' + Number(n.id) + '" style="font-size:12px;padding:6px 10px"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>'
                + '</div></div>';
        }).join('');
    }

    window.openNewsModal = function(newsItem) {
        var m = document.getElementById('news-modal');
        var recipeId = newsItem ? (newsItem.recipe_id || '') : '';
        document.getElementById('news-modal-title').textContent = newsItem ? 'Редактировать' : 'Новая новость';
        document.getElementById('news-edit-id').value = newsItem ? newsItem.id : '';
        document.getElementById('news-type').value = newsItem ? newsItem.type : 'news';
        document.getElementById('news-text').value = newsItem ? newsItem.text : '';
        populateNewsRecipeSelect(recipeId);
        document.getElementById('news-badge').value = newsItem ? (newsItem.badge || '') : '';
        document.getElementById('news-label').value = newsItem ? (newsItem.label || '') : '';
        document.getElementById('news-published').checked = newsItem ? newsItem.is_published : true;
        toggleNewsRecipeFields();
        m.classList.add('open');
    };

    document.getElementById('news-type').addEventListener('change', toggleNewsRecipeFields);
    document.getElementById('news-recipe-id').addEventListener('change', syncNewsSaveState);
    function populateNewsRecipeSelect(selectedId) {
        var select = document.getElementById('news-recipe-id');
        select.innerHTML = '<option value="">Загрузка рецептов…</option>';
        ensureAdminRecipesLoaded().then(function(recipes) {
            var published = recipes.filter(function(recipe) {
                return recipe && recipe.id && (recipe.is_published || recipe.id === selectedId);
            }).sort(function(a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
            });
            select.innerHTML = '<option value="">Выберите рецепт</option>' + published.map(function(recipe) {
                return '<option value="' + esc(recipe.id) + '">' + esc(recipe.name || recipe.id) + '</option>';
            }).join('');
            select.value = selectedId || '';
            syncNewsSaveState();
        });
    }

    function toggleNewsRecipeFields() {
        var isRecipe = document.getElementById('news-type').value === 'recipe';
        document.getElementById('news-recipe-field').style.display = isRecipe ? '' : 'none';
        document.getElementById('news-badge-field').style.display = isRecipe ? '' : 'none';
        document.getElementById('news-label-field').style.display = isRecipe ? '' : 'none';
        syncNewsSaveState();
    }

    function syncNewsSaveState() {
        var isRecipe = document.getElementById('news-type').value === 'recipe';
        var selectedRecipe = document.getElementById('news-recipe-id').value;
        var saveButton = document.getElementById('news-save');
        var disabled = isRecipe && !selectedRecipe;
        saveButton.disabled = disabled;
        saveButton.title = disabled ? 'Сначала выберите рецепт' : '';
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
        var type = document.getElementById('news-type').value;
        var recipeId = document.getElementById('news-recipe-id').value;
        if (type === 'recipe' && !recipeId) {
            showToast('Выберите рецепт для анонса');
            document.getElementById('news-recipe-id').focus();
            return;
        }
        var body = {
            type: type,
            text: document.getElementById('news-text').value,
            recipe_id: recipeId || null,
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
    // ── TESTING INVITATION ────────────────────────────────────────────────────
    window.openTestingInvitationModal = function() {
        document.getElementById('testing-invitation-email').value = '';
        document.getElementById('testing-invitation-name').value = '';
        document.getElementById('testing-invitation-modal').classList.add('open');
        setTimeout(function() { document.getElementById('testing-invitation-email').focus(); }, 0);
    };

    window.closeTestingInvitationModal = function() {
        document.getElementById('testing-invitation-modal').classList.remove('open');
    };

    window.sendTestingInvitation = function() {
        var email = document.getElementById('testing-invitation-email').value.trim();
        var displayName = document.getElementById('testing-invitation-name').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Укажите корректный email');
            document.getElementById('testing-invitation-email').focus();
            return;
        }
        if (!confirm('Отправить приглашение на ' + email + '?')) return;
        var button = document.getElementById('testing-invitation-submit');
        button.disabled = true;
        button.textContent = 'Отправка…';
        api('/admin/testing-invitations', {
            method: 'POST',
            body: { email: email, displayName: displayName || null }
        }).then(function(data) {
            closeTestingInvitationModal();
            showToast('Приглашение отправлено: ' + data.email);
        }).catch(function(e) {
            showToast(e.message || 'Не удалось отправить письмо');
        }).finally(function() {
            button.disabled = false;
            button.textContent = 'Отправить письмо';
        });
    };

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
        var html = '<button class="adm-btn' + (recipeCatFilter === 'all' ? '' : '') + '" style="font-size:12px;padding:6px 12px;' + (recipeCatFilter === 'all' ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '') + '" data-admin-action="set-recipe-category" data-admin-value="all">Все (' + allRecipes.length + ')</button>';
        Object.keys(cats).forEach(function(cat) {
            var active = recipeCatFilter === cat;
            html += '<button class="adm-btn" style="font-size:12px;padding:6px 12px;' + (active ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '') + '" data-admin-action="set-recipe-category" data-admin-value="' + esc(cat) + '">' + esc(CAT_NAMES[cat] || cat) + ' (' + Number(cats[cat]) + ')</button>';
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
                ? '<button class="adm-btn" data-admin-action="clear-seasonal" style="font-size:12px;padding:6px 10px;background:var(--accent);color:#fff;border-color:var(--accent)" title="Снять признак сезонного">★ Снять</button>'
                : (r.is_published
                    ? '<button class="adm-btn" data-admin-action="set-seasonal" data-admin-id="' + esc(r.id) + '" style="font-size:12px;padding:6px 10px" title="Назначить сезонным рецептом на главной">☆ Сезонный</button>'
                    : '');
            var categoryMeta = (r.categories || [r.cat]).map(function(c) { return esc(CAT_NAMES[c] || c); }).join(', ');
            var timeMeta = esc(r.time_label || (r.time_min + ' мин'));
            var kcalMeta = esc(r.kcal);
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text);flex-wrap:wrap">' + badge + seasonalMark + '<span>' + esc(r.emoji || '') + ' ' + esc(r.name) + '</span></div>'
                + '<div style="font-size:11px;color:var(--text-3);margin-top:4px">' + categoryMeta + ' · ' + timeMeta + ' · ' + kcalMeta + ' ккал</div>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;flex-wrap:wrap;justify-content:flex-end">'
                + seasonalBtn
                + '<button class="adm-btn" data-admin-action="edit-recipe" data-admin-id="' + esc(r.id) + '" style="font-size:12px;padding:6px 10px" title="Открыть в редакторе">✏️</button>'
                + '<button class="adm-btn adm-btn-reject" data-admin-action="delete-recipe" data-admin-id="' + esc(r.id) + '" style="font-size:12px;padding:6px 10px"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>'
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
        api('/admin/recipes/' + encodeURIComponent(id), { method: 'DELETE' }).then(function() {
            showToast('Удалено');
            loadRecipesList();
        });
    };

    // ── VIDEO REQUESTS ───────────────────────────────────────────────────────
    function videoRequestStatusMeta(status) {
        var map = {
            collecting: { label: 'Собирает голоса', bg: '#f1eee8', color: '#70675b' },
            goal_reached: { label: 'Нужно снять', bg: 'var(--accent-l)', color: 'var(--accent)' },
            planned: { label: 'Запланировано', bg: 'var(--blue-l)', color: 'var(--blue)' },
            filming: { label: 'Снимается', bg: 'var(--yellow-l)', color: 'var(--yellow)' },
            published: { label: 'Видео добавлено', bg: 'var(--green-l)', color: 'var(--green)' }
        };
        return map[status] || map.collecting;
    }

    function loadVideoRequests(badgeOnly) {
        api('/admin/video-requests').then(function(items) {
            items = Array.isArray(items) ? items : [];
            var waiting = items.filter(function(item) { return item.status === 'goal_reached'; }).length;
            var badge = document.getElementById('video-requests-badge');
            if (badge) {
                badge.textContent = waiting;
                badge.style.display = waiting > 0 ? 'inline-flex' : 'none';
            }
            if (!badgeOnly) renderVideoRequests(items);
        }).catch(function(e) {
            if (!badgeOnly) {
                var tbody = document.getElementById('video-requests-tbody');
                if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="adm-empty">' + esc(e.message || 'Ошибка загрузки') + '</td></tr>';
            }
        });
    }
    window.loadVideoRequests = loadVideoRequests;

    function renderVideoRequests(items) {
        var tbody = document.getElementById('video-requests-tbody');
        if (!tbody) return;
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="adm-empty">Пока никто не голосовал за видеорецепты</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(function(item) {
            var meta = videoRequestStatusMeta(item.status);
            var percent = Math.min(100, Math.round((Number(item.votes) || 0) / Math.max(1, Number(item.goal) || 10) * 100));
            var actions = '';
            if (item.status === 'goal_reached') {
                actions += '<button class="adm-btn" data-admin-action="set-video-request-status" data-admin-id="' + esc(item.recipeId) + '" data-admin-status="planned">В план</button>';
            } else if (item.status === 'planned') {
                actions += '<button class="adm-btn" data-admin-action="set-video-request-status" data-admin-id="' + esc(item.recipeId) + '" data-admin-status="filming">Начать съёмку</button>';
            } else if (item.status === 'filming') {
                actions += '<button class="adm-btn" data-admin-action="set-video-request-status" data-admin-id="' + esc(item.recipeId) + '" data-admin-status="planned">Вернуть в план</button>';
            }
            actions += '<button class="adm-btn" data-admin-action="edit-recipe" data-admin-id="' + esc(item.recipeId) + '" title="Добавить ссылки на видео">✏️ Рецепт</button>';
            return '<tr>'
                + '<td><strong>' + esc(item.name) + '</strong><div style="font-size:11px;color:var(--text-3);margin-top:3px">' + esc(item.recipeId) + '</div></td>'
                + '<td><strong style="font-size:16px">' + Number(item.votes) + '</strong> / ' + Number(item.goal)
                + '<div style="width:110px;max-width:100%;height:5px;background:#eee6dc;margin-top:6px"><span style="display:block;width:' + percent + '%;height:100%;background:var(--accent)"></span></div></td>'
                + '<td><span class="st-badge" style="background:' + meta.bg + ';color:' + meta.color + '">' + esc(meta.label) + '</span></td>'
                + '<td>' + fmtDate(item.reachedAt) + '</td>'
                + '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' + actions + '</div></td>'
                + '</tr>';
        }).join('');
    }

    window.updateVideoRequestStatus = function(id, status) {
        api('/admin/video-requests/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { status: status }
        }).then(function() {
            showToast('Статус обновлён');
            loadVideoRequests();
        }).catch(function(e) {
            showToast(e.message || 'Не удалось обновить статус');
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
                if (!r || (!r.fromCategory && !(Array.isArray(r.order) && r.order.length) && !(Array.isArray(r.items) && r.items.length) && !r.optional)) return '';
                var name = r.fromCategory ? (CAT_NAMES[r.fromCategory] || r.fromCategory) : 'точный список';
                var suffix = (r.fromCategory || (Array.isArray(r.items) && r.items.length)) ? (r.fromCategory ? ' ← ' + esc(name) : ': ' + esc(name)) : '';
                if (Array.isArray(r.items) && r.items.length && r.fromCategory) suffix += ' + точный список';
				if (r.optional) suffix += ' · по желанию';
                return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;margin:2px 2px 0 0">' + s.label + suffix + '</span>';
            }).join('');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:#fff">'
                + '<div style="flex:1;min-width:0">'
                + '<div style="font-size:14px;font-weight:600">' + esc(c.emoji || '') + ' ' + esc(c.name) + ' <span style="font-size:11px;color:var(--text-3);font-weight:400">(' + esc(c.id) + ')</span></div>'
                + (c.description ? '<div style="font-size:11px;color:var(--text-3);margin-top:2px">' + esc(c.description) + '</div>' : '')
                + (rules ? '<div style="margin-top:6px">' + rules + '</div>' : '')
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">'
                + '<button class="adm-btn" data-admin-action="edit-category" data-admin-id="' + esc(c.id) + '" style="font-size:12px;padding:6px 10px">✏️</button>'
                + '</div></div>';
        }).join('');
    }

    function populateCatSelect(selectId, currentValue, excludeId) {
        var el = document.getElementById(selectId);
        var opts = '<option value="">— нет —</option>';
        allCategories.forEach(function(c) {
            if (c.id === excludeId) return;
            var sel = c.id === currentValue ? ' selected' : '';
            opts += '<option value="' + esc(c.id) + '"' + sel + '>' + esc(c.name) + '</option>';
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
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" data-admin-action="move-addon" data-admin-field="' + esc(field) + '" data-admin-index="' + Number(index) + '" data-admin-direction="-1"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" data-admin-action="move-addon" data-admin-field="' + esc(field) + '" data-admin-index="' + Number(index) + '" data-admin-direction="1"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '</div>' +
                    '<div style="min-width:0;flex:1">' +
                    '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:normal">' + esc(item.label) + '</div>' +
                    (item.meta ? '<div style="font-size:10px;color:var(--text-3)">' + esc(item.meta) + '</div>' : '') +
                    '</div>' +
                    '</div>';
            }).join('') +
            (hasCustom ? '<button type="button" class="adm-btn" style="font-size:11px;padding:5px 9px;margin-top:2px" data-admin-action="reset-addon" data-admin-field="' + esc(field) + '">Сбросить ручной порядок</button>' : '');
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
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" data-admin-action="move-exact" data-admin-field="' + esc(field) + '" data-admin-index="' + Number(index) + '" data-admin-direction="-1"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                    '<button type="button" class="adm-btn" style="font-size:12px;padding:2px 7px" data-admin-action="move-exact" data-admin-field="' + esc(field) + '" data-admin-index="' + Number(index) + '" data-admin-direction="1"' + (index === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                    '</div>' +
                    '<div style="min-width:0;flex:1">' +
                    '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:normal">' + esc(exactItemLabel(item)) + '</div>' +
                    '<div style="font-size:10px;color:var(--text-3)">' + (item.recipeId ? 'рецепт из базы' : 'ручная добавка') + '</div>' +
                    '</div>' +
                    '<button type="button" class="adm-btn adm-btn-reject" style="font-size:12px;padding:3px 8px" data-admin-action="remove-exact" data-admin-field="' + esc(field) + '" data-admin-index="' + Number(index) + '">×</button>' +
                    '</div>';
            }).join('')
            : '<div style="font-size:11px;color:var(--text-3);padding:6px 0">Точный список пуст. Используйте его, когда нужны конкретные добавки, а не вся категория.</div>';
        listEl.innerHTML =
            '<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">Точный список: конкретные добавки для этого слота. Они показываются вместе с добавками из категории, если категория выбрана.</div>' +
            rows +
            '<div style="display:flex;gap:6px;margin-top:6px;align-items:center">' +
            '<select class="adm-modal-select" id="' + field + '-exact-recipe" style="flex:1;font-size:12px;padding:7px 8px">' + recipeOptions + '</select>' +
            '<button type="button" class="adm-btn" style="font-size:12px;padding:7px 10px" data-admin-action="add-exact-recipe" data-admin-field="' + esc(field) + '">Добавить</button>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;align-items:center">' +
            '<input class="adm-modal-input" id="' + field + '-exact-name" placeholder="Название" style="font-size:12px;padding:7px 8px;flex:2 1 170px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-amount" placeholder="Кол-во" style="font-size:12px;padding:7px 8px;flex:1 1 78px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-kcal" placeholder="ккал" type="number" style="font-size:12px;padding:7px 6px;width:54px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-protein" placeholder="б" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-fat" placeholder="ж" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-carbs" placeholder="у" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<input class="adm-modal-input" id="' + field + '-exact-fiber" placeholder="кл" type="number" step="0.1" style="font-size:12px;padding:7px 6px;width:46px">' +
            '<button type="button" class="adm-btn" style="font-size:12px;padding:7px 10px" data-admin-action="add-exact-static" data-admin-field="' + esc(field) + '">Добавить</button>' +
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
			if (s.key === 'protein') document.getElementById('cat-aa-protein-optional').checked = false;
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
			if (s.key === 'protein') document.getElementById('cat-aa-protein-optional').checked = !!r.optional;
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
			var optional = s.key === 'protein' && document.getElementById('cat-aa-protein-optional').checked;
            if (v || order.length || exactItems.length || optional) {
                body.auto_addons[s.key] = {};
                if (v) body.auto_addons[s.key].fromCategory = v;
                if (order.length) body.auto_addons[s.key].order = order;
                if (exactItems.length) body.auto_addons[s.key].items = exactItems;
				if (optional) body.auto_addons[s.key].optional = true;
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
        var statusParam = fbFilter === 'all' ? '' : '&status=' + encodeURIComponent(fbFilter);
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
            var catLabel = esc(FB_CAT_LABELS[f.category] || f.category);
            var st = FB_STATUS_BADGE[f.status] || { cls: '', label: f.status };
            var statusBadge = '<span class="st-badge ' + cssToken(st.cls) + '">' + esc(st.label) + '</span>';
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
                actions = '<button class="' + actionCls + '" data-admin-action="open-feedback" data-admin-id="' + Number(f.id) + '" style="font-size:12px;padding:6px 12px">' + actionLabel + '</button>';
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
            html += '<div style="text-align:center;margin:16px 0"><button class="adm-btn" data-admin-action="load-more-feedback" style="padding:8px 24px">Загрузить ещё</button></div>';
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
            '<strong>' + esc(f.display_name || f.email) + '</strong>' + (f.display_name ? '<br><span style="font-size:11px;color:var(--text-3)">' + esc(f.email) + '</span>' : '') + ' · ' + esc(FB_CAT_LABELS[f.category] || f.category);
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
        login: '🔑 Вход на платформу',
        platform_visit: '👋 Пользователь открыл платформу',
        register: '📝 Создан аккаунт',
        trial_granted: '✅ Пробный доступ включён',
        trial_denied: '🚫 Пробный доступ не выдан',
        trial_fingerprint_invalid: '⚠️ Не удалось проверить устройство',
        trial_fingerprint_missing: '👁 Устройство не подтверждено',
        trial_network_watch: '👁 Регистрации из одной сети',
        trial_network_alert: '🚨 Подозрительная серия регистраций',
        login_blocked: '⛔ Вход отклонён: аккаунт заблокирован',
        payment_submit: '💳 Отправлена заявка на оплату',
        payment_confirm: '💰 Оплата подтверждена',
        payment_reject: '❌ Оплата отклонена',
        early_access_adjust: '👥 Изменён резерв мест',
        user_block: '🔒 Пользователь заблокирован',
        user_unblock: '🔓 Пользователь разблокирован',
        user_delete: '🗑 Пользователь удалён',
        subscription_extend: '📅 Подписка продлена',
        feedback_reply: '💬 Администратор ответил на обращение',
        review_delete: '🗑 Отзыв удалён',
        review_reply: '💬 Администратор ответил на отзыв',
        video_request_status: '🎬 Обновлён запрос на видео',
        news_create: '📰 Новость создана',
        news_update: '📰 Новость изменена',
        news_delete: '🗑 Новость удалена',
        recipe_create: '🍽 Рецепт создан',
        recipe_update: '🍽 Рецепт изменён',
        recipe_delete: '🗑 Рецепт удалён',
        recipe_seasonal_set: '🌿 Выбран сезонный рецепт',
        recipe_seasonal_clear: '🌿 Сезонный рецепт снят',
        ingredient_catalog_upsert: '🥕 Обновлён ингредиент',
        category_create: '📁 Категория создана',
        category_update: '📁 Категория изменена',
        category_delete: '🗑 Категория удалена',
        testing_invitation_send: '✉ Отправлено приглашение тестеру',
        personal_message_send: '✉ Отправлено личное письмо',
        admin_mfa_failed: '🔐 Не пройдена проверка входа администратора',
        admin_oauth_denied: '🔐 Администратору запрещён вход через соцсеть'
    };

    function populateRecipeOrderCategories(selectedId) {
        var select = document.getElementById('recipe-order-category');
        if (!select) return;
        select.innerHTML = allCategories.map(function(category) {
            return '<option value="' + esc(category.id) + '"' + (category.id === selectedId ? ' selected' : '') + '>' + esc(category.name) + '</option>';
        }).join('');
    }

    function recipeOrderBadge(recipe) {
        if (!recipe.is_published) return '<span class="rbadge rbadge-draft">Черновик</span>';
        var level = getRecipeAccessLevel(recipe);
        return '<span class="rbadge rbadge-' + (level === 'pro' ? 'pro' : level) + '">' + esc(level) + '</span>';
    }

    function renderRecipeCategoryOrder() {
        var list = document.getElementById('recipe-order-list');
        if (!list) return;
        if (!recipeCategoryOrder.recipes.length) {
            list.innerHTML = '<div class="adm-empty">В этой категории пока нет рецептов</div>';
            return;
        }
        list.innerHTML = recipeCategoryOrder.recipes.map(function(recipe, index) {
            var disabledUp = index === 0 ? ' disabled' : '';
            var disabledDown = index === recipeCategoryOrder.recipes.length - 1 ? ' disabled' : '';
            return '<div class="recipe-order-row" draggable="true" data-recipe-order-id="' + esc(recipe.id) + '">'
                + '<span class="recipe-order-grip" aria-hidden="true">⠿</span>'
                + '<span class="recipe-order-num">' + (index + 1) + '</span>'
                + '<span class="recipe-order-name">' + esc(recipe.emoji || '🍴') + ' ' + esc(recipe.name) + '</span>'
                + recipeOrderBadge(recipe)
                + '<span class="recipe-order-actions">'
                + '<button class="adm-btn" data-admin-action="move-recipe-category-order" data-admin-id="' + esc(recipe.id) + '" data-admin-direction="-1" title="Выше"' + disabledUp + '>↑</button>'
                + '<button class="adm-btn" data-admin-action="move-recipe-category-order" data-admin-id="' + esc(recipe.id) + '" data-admin-direction="1" title="Ниже"' + disabledDown + '>↓</button>'
                + '</span></div>';
        }).join('');
        list.querySelectorAll('[data-recipe-order-id]').forEach(function(row) {
            row.addEventListener('dragstart', function(event) {
                recipeCategoryOrder.draggingId = row.dataset.recipeOrderId;
                row.classList.add('is-dragging');
                event.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', function() {
                recipeCategoryOrder.draggingId = '';
                list.querySelectorAll('.is-dragging,.is-drag-over').forEach(function(item) { item.classList.remove('is-dragging', 'is-drag-over'); });
            });
            row.addEventListener('dragover', function(event) {
                if (!recipeCategoryOrder.draggingId || recipeCategoryOrder.draggingId === row.dataset.recipeOrderId) return;
                event.preventDefault();
                row.classList.add('is-drag-over');
            });
            row.addEventListener('dragleave', function() { row.classList.remove('is-drag-over'); });
            row.addEventListener('drop', function(event) {
                event.preventDefault();
                var from = recipeCategoryOrder.recipes.findIndex(function(recipe) { return recipe.id === recipeCategoryOrder.draggingId; });
                var to = recipeCategoryOrder.recipes.findIndex(function(recipe) { return recipe.id === row.dataset.recipeOrderId; });
                if (from < 0 || to < 0 || from === to) return;
                var moved = recipeCategoryOrder.recipes.splice(from, 1)[0];
                recipeCategoryOrder.recipes.splice(to, 0, moved);
                renderRecipeCategoryOrder();
            });
        });
    }

    function loadRecipeCategoryOrder(categoryId) {
        var list = document.getElementById('recipe-order-list');
        if (list) list.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div></div>';
        return api('/admin/recipe-category-order/' + encodeURIComponent(categoryId)).then(function(data) {
            recipeCategoryOrder.categoryId = categoryId;
            recipeCategoryOrder.recipes = data.recipes || [];
            populateRecipeOrderCategories(categoryId);
            renderRecipeCategoryOrder();
        }).catch(function(error) {
            if (list) list.innerHTML = '<div class="adm-empty">' + esc(error.message || 'Не удалось загрузить порядок') + '</div>';
        });
    }

    window.openRecipeCategoryOrder = function() {
        var panel = document.getElementById('recipe-order-panel');
        if (!panel) return;
        var preferred = recipeCatFilter !== 'all' ? recipeCatFilter : (allCategories[0] && allCategories[0].id);
        if (!preferred) { showToast('Сначала загрузите категории', true); return; }
        panel.hidden = false;
        loadRecipeCategoryOrder(preferred);
    };

    window.closeRecipeCategoryOrder = function() {
        document.getElementById('recipe-order-panel').hidden = true;
    };

    window.moveRecipeCategoryOrder = function(id, direction) {
        var index = recipeCategoryOrder.recipes.findIndex(function(recipe) { return recipe.id === id; });
        var nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= recipeCategoryOrder.recipes.length) return;
        var item = recipeCategoryOrder.recipes.splice(index, 1)[0];
        recipeCategoryOrder.recipes.splice(nextIndex, 0, item);
        renderRecipeCategoryOrder();
    };

    window.resetRecipeCategoryOrder = function() {
        if (recipeCategoryOrder.categoryId) loadRecipeCategoryOrder(recipeCategoryOrder.categoryId);
    };

    window.saveRecipeCategoryOrder = function() {
        var ids = recipeCategoryOrder.recipes.map(function(recipe) { return recipe.id; });
        if (!recipeCategoryOrder.categoryId || !ids.length) return;
        api('/admin/recipe-category-order/' + encodeURIComponent(recipeCategoryOrder.categoryId), {
            method: 'PUT', body: { recipe_ids: ids }
        }).then(function() {
            showToast('Порядок сохранён');
            loadRecipeCategoryOrder(recipeCategoryOrder.categoryId);
        }).catch(function(error) {
            showToast(error.message || 'Не удалось сохранить порядок', true);
        });
    };

    document.addEventListener('change', function(event) {
        if (event.target && event.target.id === 'recipe-order-category') {
            loadRecipeCategoryOrder(event.target.value);
        }
    });

    function formatAuditDetail(event, detail) {
        var value = String(detail || '').trim();
        var trialReason = {
            fingerprint_used: 'На этом устройстве пробный период уже использовали.',
            fingerprint_missing: 'Не удалось подтвердить устройство для выдачи пробного доступа.',
            fingerprint_seen_other_network: 'Устройство уже встречалось в другой сети; пробный доступ всё равно включён.'
        };
        if (event === 'register') return value ? 'Способ регистрации: ' + value + '.' : 'Пользователь зарегистрировался.';
        if (event === 'login') return value === 'oauth' ? 'Пользователь вошёл через соцсеть.' : 'Пользователь вошёл по email.';
        if (event === 'platform_visit') return 'Пользователь открыл платформу. Запись создаётся не чаще одного раза в день.';
        if (event === 'trial_granted') return trialReason[value] || 'Пробный доступ успешно включён.';
        if (event === 'trial_denied') return trialReason[value.replace(/ \([^)]*\)$/, '')] || 'Пробный доступ не был включён.';
        if (event === 'trial_fingerprint_invalid') return 'Данные устройства в запросе оказались некорректными.';
        if (event === 'trial_fingerprint_missing') return 'Регистрация прошла без подтверждения устройства.';
        if (event === 'trial_network_watch' || event === 'trial_network_alert') {
            try {
                var network = JSON.parse(value);
                return 'За последние 24 часа из этой сети: ' + Number(network.count24h || 0) +
                    '; за 7 дней: ' + Number(network.count7d || 0) +
                    '; за 90 дней: ' + Number(network.count90d || 0) + ' регистраций.';
            } catch (ignore) {
                return 'Зафиксирована необычная активность регистраций из одной сети.';
            }
        }
        if (event === 'payment_submit') return value ? 'Сумма заявки: ' + value + '.' : 'Пользователь отправил заявку на оплату.';
        if (event === 'payment_confirm') return 'Заявка на оплату подтверждена; подписка продлена.';
        if (event === 'payment_reject') return 'Заявка на оплату отклонена.';
        if (event === 'user_block') return 'Администратор заблокировал аккаунт.';
        if (event === 'user_unblock') return 'Администратор разблокировал аккаунт.';
        if (event === 'user_delete') return 'Администратор удалил тестовый аккаунт.';
        if (event === 'subscription_extend') return 'Администратор продлил подписку пользователя.';
        if (event === 'feedback_reply') return 'Администратор ответил пользователю на обращение.';
        if (event === 'review_delete') return 'Администратор удалил отзыв.';
        if (event === 'review_reply') return 'Администратор ответил на отзыв.';
        if (event === 'testing_invitation_send') return 'Приглашение тестеру отправлено.';
        if (event === 'personal_message_send') return 'Личное письмо пользователю отправлено.';
        return value || 'Дополнительных деталей нет.';
    }

    window.loadAudit = function(append) {
        if (!append) {
            auditPage = 1;
            auditRows = [];
        }
        var filter = document.getElementById('audit-filter').value;
        var url = '/admin/audit?page=' + auditPage + '&limit=50' + (filter ? '&event=' + encodeURIComponent(filter) : '');
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
            var eventName = String(e.event || '');
            var badgeClass = 'st-active';
            if (eventName.includes('denied') || eventName.includes('blocked') || eventName.includes('reject') || eventName.includes('block') || eventName.includes('alert') || eventName.includes('invalid')) badgeClass = 'st-rejected';
            else if (eventName === 'register' || eventName === 'trial_granted' || eventName.includes('watch') || eventName.includes('missing')) badgeClass = 'st-trial';
            else if (eventName.includes('confirm') || eventName.includes('unblock')) badgeClass = 'st-confirmed';
            return '<tr>' +
                '<td class="adm-date">' + fmtDateTime(e.created_at) + '</td>' +
                '<td><span class="st-badge ' + badgeClass + '">' + esc(label) + '</span></td>' +
                '<td>' + esc(e.email) + '</td>' +
                '<td style="font-size:12px;color:var(--text-3)">' + esc(formatAuditDetail(e.event, e.detail)) + '</td>' +
                '<td style="font-size:12px;color:var(--text-3)">' + esc(e.ip) + '</td>' +
                '</tr>';
        }).join('');
        if (auditHasMore) {
            html += '<tr><td colspan="5" style="text-align:center;padding:12px"><button class="adm-btn" data-admin-action="load-more-audit" style="padding:8px 24px">Загрузить ещё</button></td></tr>';
        }
        tbody.innerHTML = html;
    }

    document.addEventListener('click', function(event) {
        var target = event.target.closest('[data-admin-action]');
        if (!target) return;
        var action = target.dataset.adminAction;
        var id = target.dataset.adminId || '';
        var field = target.dataset.adminField || '';
        var index = Number(target.dataset.adminIndex);
        if (action === 'unblock-user') window.unblockUser(id);
        else if (action === 'delete-user') window.deleteUserById(id);
        else if (action === 'extend-user') window.openExtendModalById(id);
        else if (action === 'compose-message') window.openPersonalMessageModalById(id);
        else if (action === 'block-user') window.blockUserById(id);
        else if (action === 'confirm-payment') window.openConfirm(id);
        else if (action === 'reject-payment') window.rejectPayment(id);
        else if (action === 'show-screenshot') { event.preventDefault(); window.showScreenshot(id); }
        else if (action === 'edit-news') window.editNews(Number(id));
        else if (action === 'delete-news') window.deleteNews(Number(id));
        else if (action === 'set-recipe-category') window.setRecipeCat(target.dataset.adminValue || 'all');
        else if (action === 'open-recipe-category-order') window.openRecipeCategoryOrder();
        else if (action === 'close-recipe-category-order') window.closeRecipeCategoryOrder();
        else if (action === 'move-recipe-category-order') window.moveRecipeCategoryOrder(id, Number(target.dataset.adminDirection));
        else if (action === 'reset-recipe-category-order') window.resetRecipeCategoryOrder();
        else if (action === 'save-recipe-category-order') window.saveRecipeCategoryOrder();
        else if (action === 'clear-seasonal') window.clearSeasonal();
        else if (action === 'set-seasonal') window.setSeasonal(id);
        else if (action === 'edit-recipe') window.openRecipeEditor(id);
        else if (action === 'delete-recipe') window.deleteRecipe(id);
        else if (action === 'set-video-request-status') window.updateVideoRequestStatus(id, target.dataset.adminStatus);
        else if (action === 'edit-category') window.editCategory(id);
        else if (action === 'move-addon') window.moveAddonOrder(field, index, Number(target.dataset.adminDirection));
        else if (action === 'reset-addon') window.resetAddonOrder(field);
        else if (action === 'move-exact') window.moveExactItem(field, index, Number(target.dataset.adminDirection));
        else if (action === 'remove-exact') window.removeExactItem(field, index);
        else if (action === 'add-exact-recipe') window.addExactRecipe(field);
        else if (action === 'add-exact-static') window.addExactStatic(field);
        else if (action === 'open-feedback') window.openFbReply(Number(id));
        else if (action === 'load-more-feedback') window.loadMoreFeedback();
        else if (action === 'load-more-audit') window.loadMoreAudit();
    });

    // ── Init ──
    loadStats();
    var initialTab = normalizeAdminTab(new URLSearchParams(location.search).get('tab'));
    if (initialTab !== 'users') {
        switchTab(initialTab);
    }

    // CSP: static admin handlers migrated from HTML attributes.
    function bindStaticAdminHandler(eventName, id, handler) {
        document.querySelectorAll('[data-admin-' + eventName + '="' + id + '"]')
            .forEach(function(element) {
                element.addEventListener(eventName, function(event) {
                    if (handler.call(this, event) === false) event.preventDefault();
                });
            });
    }

    bindStaticAdminHandler("click", "d81da2bb858d", function(event) { doLogout() });
    bindStaticAdminHandler("click", "48095b44bae8", function(event) { switchTab('dashboard') });
    bindStaticAdminHandler("click", "695f4a379b55", function(event) { switchTab('users') });
    bindStaticAdminHandler("click", "f594c8aaab75", function(event) { switchTab('payments') });
    bindStaticAdminHandler("click", "ff4a35111351", function(event) { switchTab('news') });
    bindStaticAdminHandler("click", "7c5d2f2d56d3", function(event) { switchTab('recipes') });
    bindStaticAdminHandler("click", "08960e2bb8be", function(event) { switchTab('video-requests') });
    bindStaticAdminHandler("click", "9ddbe8a190e7", function(event) { switchTab('categories') });
    bindStaticAdminHandler("click", "b0a333bacfb0", function(event) { switchTab('feedback') });
    bindStaticAdminHandler("click", "c829355ef746", function(event) { switchTab('audit') });
    bindStaticAdminHandler("input", "af40a244cf7b", function(event) { filterUsers() });
    bindStaticAdminHandler("change", "2ae747887602", function(event) { filterUsers() });
    bindStaticAdminHandler("click", "6509a16e5375", function(event) { loadPayments('pending') });
    bindStaticAdminHandler("click", "25cd91e1b230", function(event) { loadPayments('confirmed') });
    bindStaticAdminHandler("click", "7b81491b9670", function(event) { loadPayments('rejected') });
    bindStaticAdminHandler("click", "a4f41ea9f9b7", function(event) { saveEarlyAccessAdjustment() });
    bindStaticAdminHandler("click", "6e20c755b43a", function(event) { openTestingInvitationModal() });
    bindStaticAdminHandler("click", "f087ddda46f6", function(event) { openNewsModal() });
    bindStaticAdminHandler("click", "53bdeb78bea9", function(event) { openRecipeEditor() });
    bindStaticAdminHandler("change", "2fc16510c28d", function(event) { filterRecipes() });
    bindStaticAdminHandler("input", "8978f80bc9b7", function(event) { filterRecipes() });
    bindStaticAdminHandler("click", "9467f5428096", function(event) { openCategoryModal() });
    bindStaticAdminHandler("click", "fc157669aa96", function(event) { deleteCategory() });
    bindStaticAdminHandler("click", "28bd28d03811", function(event) { closeCategoryModal() });
    bindStaticAdminHandler("click", "bafe2329042c", function(event) { saveCategory() });
    bindStaticAdminHandler("click", "3119f882a5cf", function(event) { loadFeedback('waiting_admin') });
    bindStaticAdminHandler("click", "c970900869a0", function(event) { loadFeedback('waiting_user') });
    bindStaticAdminHandler("click", "be1cdb16d86f", function(event) { loadFeedback('closed') });
    bindStaticAdminHandler("click", "9d429658dc34", function(event) { loadFeedback('all') });
    bindStaticAdminHandler("click", "b8da07356966", function(event) { closeFbReplyModal() });
    bindStaticAdminHandler("click", "870fb8fc606b", function(event) { submitFbReply() });
    bindStaticAdminHandler("change", "4a89cbc6b5fc", function(event) { loadAudit() });
    bindStaticAdminHandler("click", "089ea8a8218e", function(event) { closeModal() });
    bindStaticAdminHandler("click", "a2bff23a5dff", function(event) { submitConfirm() });
    bindStaticAdminHandler("click", "19c712bc4549", function(event) { document.getElementById('extend-days').value=7 });
    bindStaticAdminHandler("click", "7aed6be2c3ac", function(event) { document.getElementById('extend-days').value=30 });
    bindStaticAdminHandler("click", "448626bc5df9", function(event) { document.getElementById('extend-days').value=90 });
    bindStaticAdminHandler("click", "43dfe700a981", function(event) { document.getElementById('extend-days').value=180 });
    bindStaticAdminHandler("click", "a34cae9e09b6", function(event) { document.getElementById('extend-days').value=360 });
    bindStaticAdminHandler("click", "5d336537a4ad", function(event) { closeExtendModal() });
    bindStaticAdminHandler("click", "dc3813cfe9fa", function(event) { submitExtend() });
    bindStaticAdminHandler("click", "166dc944b93d", function(event) { if(event.target===this)this.classList.remove('open') });
    bindStaticAdminHandler("click", "1c7b2b8ca44a", function(event) { document.getElementById('screenshot-modal').classList.remove('open') });
    bindStaticAdminHandler("click", "fdf0249d21c5", function(event) { closeNewsModal() });
    bindStaticAdminHandler("click", "23ad11339792", function(event) { saveNews() });
    bindStaticAdminHandler("click", "c5b913705c2f", function(event) { closeTestingInvitationModal() });
    bindStaticAdminHandler("click", "b582456d1193", function(event) { sendTestingInvitation() });
    bindStaticAdminHandler("click", "394601a0e265", function(event) { previewPersonalMessage() });
    bindStaticAdminHandler("click", "15c3c6500a6b", function(event) { closePersonalMessageModal() });
    bindStaticAdminHandler("click", "05d9cc5c3790", function(event) { sendPersonalMessage() });
    bindStaticAdminHandler("click", "8d2d6ca2e5d4", function(event) { closePersonalMessagePreview() });
})();
