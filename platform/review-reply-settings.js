/* Reply notifications are independent from likes and the news mailing list. */
(function () {
    'use strict';
    const enabled = document.getElementById('review-replies-toggle');
    const mail = document.getElementById('review-replies-email-toggle');
    const status = document.getElementById('review-replies-status');
    const list = document.getElementById('review-replies-list');
    const more = document.getElementById('review-replies-more');
    if (!enabled || !mail || !Auth.isLoggedIn()) return;
    let saved, before;
    async function api(url, options) {
        const response = await Auth.api(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить уведомления об ответах');
        return data;
    }
    function apply(settings) {
        enabled.checked = settings.enabled;
        mail.checked = settings.email;
        enabled.disabled = false;
        mail.disabled = !settings.enabled;
    }
    async function load(append = false) {
        const data = await api('/content/review-reply-notifications' + (append && before ? '?before=' + before : ''));
        if (!append) { list.replaceChildren(); before = undefined; }
        for (const item of data.items) {
            const link = document.createElement('a');
            link.className = 'cab-like-notification';
            link.href = 'recipe.html?id=' + encodeURIComponent(item.recipe_id) + '#review-' + Number(item.review_id);
            const title = document.createElement('span');
            title.textContent = (item.actor?.trim() || 'Участник') + ' — ответ на ваш отзыв · ' + item.recipe_name;
            const text = document.createElement('span');
            text.style.display = 'block';
            text.textContent = item.text;
            link.append(title, text);
            if (!item.read_at) { const badge = document.createElement('strong'); badge.textContent = ' · Новое'; title.append(badge); }
            link.addEventListener('click', async event => {
                if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                try { await api('/content/review-reply-notifications/read', { method: 'POST', body: JSON.stringify({ ids: [item.id] }) }); } catch (_) {}
                location.href = link.href;
            });
            list.append(link);
        }
        before = data.items.at(-1)?.id || before;
        more.hidden = !data.hasMore;
        if (!list.children.length) list.textContent = saved?.enabled ? 'Здесь появятся новые ответы на ваши отзывы.' : 'Уведомления об ответах отключены.';
    }
    async function change() {
        const desired = { enabled: enabled.checked, email: mail.checked };
        enabled.disabled = mail.disabled = true;
        status.textContent = 'Сохраняем…';
        try {
            saved = await api('/auth/review-reply-settings', { method: 'PUT', body: JSON.stringify(desired) });
            apply(saved);
            status.textContent = 'Настройки сохранены';
        } catch (_) { if (saved) apply(saved); status.textContent = 'Не удалось сохранить настройки. Повторите попытку.'; return; }
        try { await load(); } catch (_) { status.textContent = 'Настройки сохранены. Не удалось обновить список уведомлений.'; }
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
        try { saved = await api('/auth/review-reply-settings'); apply(saved); await load(); }
        catch (error) { status.textContent = error.message + '. Обновите страницу, чтобы повторить.'; }
    })();
})();
