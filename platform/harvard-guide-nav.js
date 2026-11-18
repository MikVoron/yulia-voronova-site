(() => {
    const guide = document.getElementById('guide');
    if (!guide) {
        // The guide links to the existing plate editor on the homepage.
        if (location.hash === '#my-plate') {
            const plateButton = document.getElementById('plate-btn');
            if (plateButton) {
                history.replaceState(history.state, '', location.pathname + location.search);
                plateButton.click();
            }
        }
        return;
    }

    const badge = document.getElementById('user-badge');
    const menu = document.getElementById('user-dropdown');
    const profile = document.getElementById('user-wrap');

    window.openPlate = () => {
        location.href = Auth.isGuest() ? Auth._loginUrl() : '/#my-plate';
    };
    window.onUserBadgeClick = () => {
        if (Auth.isGuest()) {
            location.href = Auth._loginUrl();
            return;
        }
        badge.setAttribute('aria-expanded', String(menu.classList.toggle('open')));
    };

    function closeProfileMenu() {
        menu.classList.remove('open');
        badge.setAttribute('aria-expanded', 'false');
    }

    window.doLogout = () => {
        Auth.logout();
        renderProfile();
        SP_HEADER.render();
        badge.focus();
    };

    document.addEventListener('click', event => {
        if (!profile.contains(event.target)) closeProfileMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu.classList.contains('open')) return;
        closeProfileMenu();
        badge.focus();
    });

    function renderProfile() {
        const user = Auth.getUser();
        badge.classList.toggle('is-guest', !user);
        if (user) {
            const displayName = Auth.getDisplayName();
            const email = user.email || '';
            document.getElementById('u-name').textContent = displayName || email.split('@')[0] || 'Профиль';
            Auth.renderAvatar(document.getElementById('u-ava'), displayName || email || 'Профиль');
        } else {
            closeProfileMenu();
            document.getElementById('u-name').textContent = 'Войти';
        }
        updatePlateIcon();
    }

    renderProfile();
    SP_HEADER.render();
    loadContent().then(() => SP_HEADER.render());
})();
