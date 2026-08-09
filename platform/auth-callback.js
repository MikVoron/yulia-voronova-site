(async function() {
    try {
        // После OAuth redirect у нас есть refresh cookie — получаем access token
        const res = await fetch(API_BASE + '/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });
        if (!res.ok) throw new Error('refresh failed');
        const data = await res.json();

        Auth.login(data.user.email, data.user.displayName, data.accessToken, data.user.subscription, data.user.avatar, data.user.role, data.user.createdAt, data.user.id, data.user.weight);
        if (new URLSearchParams(location.search).get('welcome') === '1' && window.SmartPlateMetrika) {
            window.SmartPlateMetrika.goal('registration_completed');
        }

        document.getElementById('title').textContent = 'Добро пожаловать!';
        document.getElementById('sub').textContent = 'Загружаем платформу...';
        document.getElementById('spinner').classList.add('is-success');

        setTimeout(function() { location.href = 'index.html'; }, 800);
    } catch (e) {
        document.getElementById('spinner').classList.add('is-hidden');
        document.getElementById('title').textContent = 'Ошибка авторизации';
        document.getElementById('sub').classList.add('is-hidden');
        var err = document.getElementById('error');
        var retryLink = document.createElement('a');
        retryLink.href = 'login.html';
        retryLink.className = 'cb-error-link';
        retryLink.textContent = 'Попробовать снова';
        err.replaceChildren(document.createTextNode('Не удалось войти. '), retryLink);
        err.classList.add('is-visible');
    }
})();
