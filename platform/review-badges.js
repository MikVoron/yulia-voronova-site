(function () {
    'use strict';

    const details = new Map([
        ['friend', { label: 'Друг Умной тарелки', description: 'В знак благодарности от Умной тарелки' }],
        ['cooks-with-us', { label: 'Готовит с нами', description: 'Опубликован отзыв с одобренным фото блюда' }],
        ['shares-experience', { label: 'Делится опытом', description: 'Опубликованы отзывы о трёх разных рецептах' }]
    ]);

    function markup(review) {
        const badge = review.reviewBadge === undefined && (review.isSmartPlateFriend || review.isEarlyBird)
            ? 'friend'
            : review.reviewBadge;
        const label = details.get(badge)?.label;
        return label ? `<span class="review-badge" data-review-badge="${badge}">${label}</span>` : '';
    }

    async function notifyNewBadges(userId) {
        if (document.visibilityState !== 'visible') return;
        const response = await Auth.api('/content/my-review-badges');
        if (!response.ok) return;
        const { newBadges } = await response.json();
        if (!Array.isArray(newBadges) || Auth.getUser()?.id !== userId || document.visibilityState !== 'visible') return;
        const pending = newBadges.filter(badge => details.has(badge));
        if (!pending.length) return;
        const names = pending.map(badge => '«' + details.get(badge).label + '»').join(', ');
        const message = (pending.length === 1 ? 'У вас новый бейдж ' : 'У вас новые бейджи ') + names;
        if (!document.getElementById('v2-toast')) {
            const toast = document.createElement('div');
            toast.id = 'v2-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        showToast(message, 6500);
        await Auth.api('/content/my-review-badges/seen', { method: 'POST', body: { badges: pending }, keepalive: true });
    }

    let notificationStarted = false;
    function checkForNewBadges() {
        const userId = Auth.getUser()?.id;
        if (notificationStarted || !userId || document.visibilityState !== 'visible') return;
        notificationStarted = true;
        // Keep the read, announcement, and acknowledgement together across tabs.
        const check = () => notifyNewBadges(userId);
        const task = navigator.locks ? navigator.locks.request('smartplate-review-badges', check) : check();
        task.catch(() => {});
    }

    window.addEventListener('load', checkForNewBadges, { once: true });
    document.addEventListener('visibilitychange', checkForNewBadges);

    window.ReviewBadges = { details, markup };
})();
