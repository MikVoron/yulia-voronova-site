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

        document.getElementById('title').textContent = 'Добро пожаловать!';
        document.getElementById('sub').textContent = 'Загружаем платформу...';
        document.getElementById('spinner').style.borderTopColor = '#27ae60';

        setTimeout(function() { location.href = 'index.html'; }, 800);
    } catch (e) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Ошибка авторизации';
        document.getElementById('sub').style.display = 'none';
        var err = document.getElementById('error');
        err.style.display = 'block';
        err.innerHTML = 'Не удалось войти. <a href="login.html" style="color:#e8400a">Попробовать снова</a>';
    }
})();
