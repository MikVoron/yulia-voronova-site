/* Personal notification preferences and the user's like notification history. */
(function () {
    'use strict';
    const enabled = document.getElementById('review-likes-toggle');
    const mail = document.getElementById('review-likes-email-toggle');
    const status = document.getElementById('review-likes-status');
    const list = document.getElementById('review-likes-list');
    const more = document.getElementById('review-likes-more');
    if (!enabled || !mail || !Auth.isLoggedIn()) return;
    let saved, before;
    async function api(url, options) {
        const response = await Auth.api(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить уведомления');
        return data;
    }
    function apply(settings) {
        enabled.checked = settings.enabled;
        mail.checked = settings.email;
        enabled.disabled = false;
        mail.disabled = !settings.enabled;
    }
    async function load(append = false) {
        const data = await api('/content/review-like-notifications' + (append && before ? '?before=' + before : ''));
        if (!append) list.replaceChildren();
        for (const item of data.items) {
            const link = document.createElement('a');
            link.className = 'cab-like-notification';
            link.href = 'recipe.html?id=' + encodeURIComponent(item.recipe_id) + '#review-' + Number(item.review_id);
            link.textContent = (item.actor?.trim() || 'Участник') + ' поставил(а) лайк на ваш '
                + (item.comment_id || item.reply_id ? 'ответ' : 'отзыв') + ' · ' + item.recipe_name;
            if (!item.read_at) { const badge = document.createElement('strong'); badge.textContent = ' · Новое'; link.append(badge); }
            link.addEventListener('click', async event => {
                // Modified clicks keep the browser's normal open-in-new-tab behavior.
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                try { await api('/content/review-like-notifications/' + item.id + '/read', { method: 'POST' }); } catch (_) {}
                location.href = link.href;
            });
            list.append(link);
        }
        before = data.items.at(-1)?.id || before;
        more.hidden = !data.hasMore;
        if (!list.children.length) list.textContent = saved?.enabled ? 'Здесь появятся уведомления о новых лайках.' : 'Уведомления о лайках отключены.';
    }
    async function change() {
        const desired = { enabled: enabled.checked, email: mail.checked };
        enabled.disabled = mail.disabled = true;
        status.textContent = 'Сохраняем…';
        try {
            saved = await api('/auth/review-like-settings', { method: 'PUT', body: JSON.stringify(desired) });
            apply(saved);
            status.textContent = 'Настройки сохранены';
        } catch (error) { if (saved) apply(saved); status.textContent = 'Не удалось сохранить настройки. Повторите попытку.'; return; }
        try { await load(); }
        catch (error) { status.textContent = 'Настройки сохранены. Не удалось обновить список уведомлений.'; }
        if (typeof ContentUpdates !== 'undefined') ContentUpdates.refresh();
    }
    enabled.addEventListener('change', change);
    mail.addEventListener('change', change);
    more.addEventListener('click', async () => {
        more.disabled = true;
        try { await load(true); } catch (error) { status.textContent = error.message; }
        finally { more.disabled = false; }
    });
    (async () => {
        try { saved = await api('/auth/review-like-settings'); apply(saved); await load(); }
        catch (error) { status.textContent = error.message + '. Обновите страницу, чтобы повторить.'; }
    })();
})();
