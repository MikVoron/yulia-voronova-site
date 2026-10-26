/* Shared by recipe, category and ingredient review views. No rating mutations. */
(function () {
    'use strict';
    const states = new Map();
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const user = () => Auth.getUser();
    const notice = text => { if (typeof showToast === 'function') showToast(text); };
    const button = (action, label, id = '') => `<button type="button" class="discussion-button" data-discussion-action="${action}" data-comment-id="${id}">${label}</button>`;
    const date = value => esc(new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));

    function legacy(review) {
        if (!review.reply) return '';
        return `<div class="discussion-message"><strong>Юлия Воронова</strong> <span class="discussion-author-badge">Автор</span><div class="discussion-text">${esc(review.reply.text)}</div>${button('legacy-helpful', 'Полезный ответ' + (review.reply.helpfulCount ? ' · ' + Number(review.reply.helpfulCount) : ''))}</div>`;
    }

    function message(comment, state) {
        const own = user()?.id === comment.userId;
        const admin = user()?.role === 'admin';
        const avatar = comment.isAuthor ? 'images/YV-blog.webp' : comment.avatar;
        return `<article class="discussion-message" data-comment-id="${Number(comment.id)}">
            <div class="discussion-meta">
                ${avatar ? `<img class="discussion-avatar" src="${esc(avatar)}" alt="" loading="lazy" data-review-avatar-fallback><span class="discussion-initial" style="display:none">${esc(comment.author.charAt(0))}</span>` : `<span class="discussion-initial">${esc(comment.author.charAt(0))}</span>`}
                <strong>${comment.isAuthor ? 'Юлия Воронова' : esc(comment.author)}</strong>
                ${comment.isAuthor ? '<span class="discussion-author-badge">Автор</span>' : comment.userId === state.review.userId ? '<span class="discussion-origin">Автор отзыва</span>' : ''}
                <time datetime="${esc(comment.createdAt)}">${date(comment.createdAt)}</time>
            </div>
            <div class="discussion-text">${esc(comment.text)}</div>
            <div class="discussion-actions">${own ? button('edit', 'Редактировать', Number(comment.id)) : ''}${own || admin ? button('delete', 'Удалить', Number(comment.id)) : ''}</div>
        </article>`;
    }

    function messages(state) {
        const items = state.comments.map(comment => ({ at: comment.createdAt, id: comment.id, html: message(comment, state) }));
        if (state.review.reply) items.push({ at: state.review.reply.createdAt, id: 0, html: state.legacyHtml });
        return items.sort((a, b) => new Date(a.at) - new Date(b.at) || a.id - b.id).map(item => item.html).join('');
    }

    function render(review, legacyHtml) {
        const comments = Array.isArray(review.comments) ? review.comments : [];
        const state = { review, comments: [...comments], count: Number(review.commentCount) || comments.length,
            legacyHtml: legacyHtml === undefined ? legacy(review) : legacyHtml,
            after: comments.at(-1)?.id || 0, hasMore: Number(review.commentCount) > comments.length };
        states.set(Number(review.id), state);
        return `<section class="review-discussion" data-discussion-id="${Number(review.id)}" aria-label="Обсуждение отзыва">
            <div class="discussion-messages">${messages(state)}</div>
            <div class="discussion-actions">
                <button type="button" class="discussion-button discussion-more" data-discussion-action="more"${state.hasMore ? '' : ' hidden'}>Показать ещё сообщения</button>
                ${Auth.isLoggedIn() ? button('open', 'Ответить') : `<a class="discussion-button" href="${esc(Auth._loginUrl())}">Войти, чтобы ответить</a>`}
            </div>
            <form class="discussion-form" hidden>
                <label>Ваш ответ<textarea class="discussion-input" maxlength="1000" rows="3" required placeholder="Дополните отзыв или задайте вопрос"></textarea></label>
                <div class="discussion-form-footer"><span class="discussion-counter">0 / 1000</span><button class="discussion-send" type="submit">Отправить</button>${button('cancel', 'Отмена')}</div>
                <p class="discussion-error" role="status" aria-live="polite"></p>
            </form>
            <p class="discussion-status" role="status" aria-live="polite"></p>
        </section>`;
    }

    function redraw(root, state) {
        root.querySelector('.discussion-messages').innerHTML = messages(state);
        root.querySelector('.discussion-more').hidden = !state.hasMore;
    }

    async function api(url, options) {
        const response = await Auth.api(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось сохранить сообщение. Попробуйте ещё раз.');
        return data;
    }

    function closeForm(root) {
        const form = root.querySelector('form');
        form.hidden = true;
        form.reset();
        delete form.dataset.commentId;
        delete form.dataset.requestId;
        delete form.dataset.requestText;
        form.querySelector('.discussion-counter').textContent = '0 / 1000';
        form.querySelector('.discussion-error').textContent = '';
        form.querySelector('.discussion-send').textContent = 'Отправить';
        root.querySelector('[data-discussion-action="open"]')?.focus({ preventScroll: true });
    }

    document.addEventListener('input', event => {
        if (!event.target.matches('.discussion-input')) return;
        const form = event.target.closest('form');
        form.querySelector('.discussion-counter').textContent = event.target.value.length + ' / 1000';
    });

    document.addEventListener('submit', async event => {
        const form = event.target.closest('.discussion-form');
        if (!form) return;
        event.preventDefault();
        const root = form.closest('.review-discussion');
        const state = states.get(Number(root.dataset.discussionId));
        const send = form.querySelector('.discussion-send');
        if (send.disabled) return;
        const text = form.querySelector('textarea').value.trim();
        const error = form.querySelector('.discussion-error');
        error.textContent = '';
        if (!text || text.length > 1000) { error.textContent = 'Напишите сообщение: от 1 до 1000 символов'; return; }
        send.disabled = true;
        form.querySelector('textarea').readOnly = true;
        form.querySelector('[data-discussion-action="cancel"]').disabled = true;
        try {
            const id = Number(form.dataset.commentId);
            if (id) {
                await api('/content/review-comments/' + id, { method: 'PUT', body: JSON.stringify({ text }) });
                const comment = state.comments.find(item => item.id === id);
                if (comment) { comment.text = text; comment.updatedAt = new Date().toISOString(); }
            } else {
                // Reuse the nonce after an uncertain network outcome, so a retry cannot duplicate a post.
                if (!form.dataset.requestId || form.dataset.requestText !== text) {
                    form.dataset.requestId = crypto.randomUUID();
                    form.dataset.requestText = text;
                }
                const result = await api('/content/reviews/' + state.review.id + '/comments', {
                    method: 'POST', body: JSON.stringify({ text, requestId: form.dataset.requestId }),
                });
                if (!state.comments.some(item => item.id === result.comment.id)) {
                    state.comments.push(result.comment);
                    state.count++;
                }
            }
            redraw(root, state);
            closeForm(root);
            root.querySelector('.discussion-status').textContent = id ? 'Сообщение сохранено' : 'Ответ опубликован';
            notice(id ? 'Сообщение сохранено' : 'Ответ опубликован');
        } catch (err) { error.textContent = err.message || 'Ошибка сети. Попробуйте ещё раз.'; }
        finally {
            send.disabled = false;
            form.querySelector('textarea').readOnly = false;
            form.querySelector('[data-discussion-action="cancel"]').disabled = false;
        }
    });

    document.addEventListener('click', async event => {
        const control = event.target.closest('[data-discussion-action]');
        if (!control || control.disabled) return;
        const root = control.closest('.review-discussion');
        const state = states.get(Number(root.dataset.discussionId));
        const form = root.querySelector('form');
        const action = control.dataset.discussionAction;
        const id = Number(control.dataset.commentId);
        if (action === 'cancel') { closeForm(root); return; }
        if (action === 'open' || action === 'edit') {
            if (form.querySelector('.discussion-send').disabled) return;
            if (action === 'edit') {
                const comment = state.comments.find(item => item.id === id);
                if (!comment) return;
                form.dataset.commentId = id;
                form.querySelector('textarea').value = comment.text;
            } else if (form.hidden || form.dataset.commentId) {
                form.reset(); delete form.dataset.commentId;
            }
            form.querySelector('.discussion-send').textContent = action === 'edit' ? 'Сохранить' : 'Отправить';
            form.querySelector('.discussion-counter').textContent = form.querySelector('textarea').value.length + ' / 1000';
            form.hidden = false;
            form.querySelector('textarea').focus();
            return;
        }
        control.disabled = true;
        root.querySelector('.discussion-status').textContent = '';
        try {
            if (action === 'more') {
                const data = await api('/content/reviews/' + state.review.id + '/comments?after=' + state.after);
                for (const comment of data.comments) if (!state.comments.some(item => item.id === comment.id)) state.comments.push(comment);
                if (data.comments.length) state.after = data.comments.at(-1).id;
                state.hasMore = data.hasMore;
                redraw(root, state);
            } else if (action === 'delete') {
                const confirmed = typeof showAppConfirm === 'function'
                    ? await showAppConfirm({ title: 'Удалить сообщение?', text: 'Это действие нельзя отменить.', confirmText: 'Удалить', cancelText: 'Отмена', danger: true })
                    : window.confirm('Удалить сообщение?');
                if (!confirmed) return;
                await api('/content/review-comments/' + id, { method: 'DELETE' });
                state.comments = state.comments.filter(item => item.id !== id);
                state.count--;
                if (Number(form.dataset.commentId) === id) closeForm(root);
                redraw(root, state);
                root.querySelector('.discussion-status').textContent = 'Сообщение удалено';
            } else if (action === 'legacy-helpful') {
                if (!Auth.isLoggedIn()) { location.href = Auth._loginUrl(); return; }
                const data = await api('/content/reviews/' + state.review.id + '/reply-helpful', { method: 'POST' });
                state.review.reply.helpfulCount = data.helpfulCount;
                state.review.reply.helpfulByCurrentUser = data.active;
                state.legacyHtml = legacy(state.review);
                redraw(root, state);
            }
        } catch (err) { root.querySelector('.discussion-status').textContent = err.message || 'Ошибка сети'; }
        finally { control.disabled = false; }
    });

    window.ReviewDiscussions = { render };
})();
