document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorMsg = document.getElementById('errorMsg');

    form.onsubmit = async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        errorMsg.textContent = '';

        if (!username || !password) {
            errorMsg.textContent = 'Введите имя и пароль!';
            return;
        }

        try {
            const resp = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await resp.json();

            if (resp.ok) {
                window.location.href = '/';
            } else {
                errorMsg.textContent = data.error || 'Ошибка входа';
            }
        } catch (err) {
            errorMsg.textContent = 'Ошибка сети';
        }
    };
});