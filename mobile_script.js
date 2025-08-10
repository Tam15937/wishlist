let users = [];
let selectedUserId = null;

const socket = io();

socket.on('connect', () => {
    console.log('Подключены к серверу WebSocket');
});

socket.on('update', () => {
    console.log('Получено обновление от сервера');
    loadUsers();
});

socket.on('disconnect', () => {
    console.log('Отключены от сервера WebSocket');
});

async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Неавторизован');
        users = await res.json();
        renderUsers();
        renderWishlist();
        renderDeleteButton();
    } catch (e) {
        console.error('Ошибка загрузки списков:', e);
        if (e.message === 'Неавторизован') {
            alert('Сессия истекла. Пожалуйста, войдите заново.');
            window.location.href = '/login';
        }
    }
}

function renderUsers() {
    const ul = document.getElementById('userItems');
    ul.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.name || '(без названия)';
        li.className = (user.id === selectedUserId) ? 'selected' : '';
        li.onclick = () => {
            selectedUserId = user.id;
            renderUsers();
            renderWishlist();
            renderDeleteButton();
        };
        ul.appendChild(li);
    });
}

function renderWishlist() {
    const block = document.getElementById('wishlistContent');
    const user = users.find(u => u.id === selectedUserId);
    if (!user) {
        block.innerHTML = '<p>Выберите пользователя слева, чтобы увидеть его wishlist.</p>';
        return;
    }

    let html = `<h2>Wishlist: ${user.name}</h2><ul style="list-style:none; padding-left:0;">`;
    user.wishlist.forEach((item, index) => {
        const checked = item.taken ? 'checked' : '';
        // Проверяем валидность ссылки
        let linkHtml = '';
        if (item.link && typeof item.link === 'string' && item.link.trim() !== '' && /^https?:\/\//i.test(item.link.trim())) {
            const urlEscaped = item.link.trim().replace(/"/g, '&quot;');
            linkHtml = `<div style="margin-left: 28px; margin-top: 4px;">
                <a href="${urlEscaped}" target="_blank" rel="noopener noreferrer"
                    style="padding: 4px 8px; border: 1px solid #2196f3; border-radius: 4px; font-size: 0.9em; color: #2196f3; text-decoration: none; display: inline-block;">
                    ссылка
                </a>
            </div>`;
        }
        html += `<li style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center;">
                <input type="checkbox" data-index="${index}" ${checked} />
                <span class="${item.taken ? 'taken' : ''}" style="margin-left: 8px;">${item.name}</span>
            </label>
            ${linkHtml}
        </li>`;
    });
    html += '</ul>';
    block.innerHTML = html;

    block.querySelectorAll('input[type=checkbox]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const idx = e.target.getAttribute('data-index');
            try {
                const res = await fetch(`/api/toggle_item/${selectedUserId}/${idx}`, { method: 'POST' });
                if (!res.ok) {
                    let errorMsg = 'Ошибка при отметке подарка';
                    try {
                        const data = await res.json();
                        if (data && data.error) errorMsg = data.error;
                    } catch (_) { /* ignore */ }
                    throw new Error(errorMsg);
                }
            } catch (err) {
                alert(err.message);
                e.target.checked = !e.target.checked;
            }
        });
    });
}

function getCookie(name) {
    const cookieStr = document.cookie;
    const cookies = cookieStr.split('; ').reduce((acc, cur) => {
        const [key, val] = cur.split('=');
        acc[key] = decodeURIComponent(val);
        return acc;
    }, {});
    return cookies[name];
}

function renderDeleteButton() {
    const deleteSection = document.getElementById('deleteSection');
    deleteSection.innerHTML = '';
    if (selectedUserId === null) return;

    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    const currentUserId = getCookie('user_id');

    if (!user.user_id || !currentUserId) return;

    if (String(currentUserId) !== String(user.user_id)) return;

    const btn = document.createElement('button');
    btn.textContent = 'Удалить список';
    btn.onclick = () => {
        if (confirm('Вы уверены, что хотите удалить свой список?')) {
            deleteList(selectedUserId);
        }
    };
    deleteSection.appendChild(btn);
}

async function deleteList(id) {
    try {
        const res = await fetch(`/api/delete_list/${id}`, { method: 'POST' });
        if (res.ok) {
            selectedUserId = null;
            await loadUsers();
            document.getElementById('wishlistContent').innerHTML = '<p>Выберите пользователя слева, чтобы увидеть его wishlist.</p>';
            document.getElementById('deleteSection').innerHTML = '';
        } else if (res.status === 403) {
            alert('Недостаточно прав для удаления списка');
        } else {
            alert('Ошибка удаления списка');
        }
    } catch (e) {
        alert('Ошибка сети при удалении');
        console.error(e);
    }
}

function showCreateListForm() {
    const block = document.getElementById('wishlistContent');
    block.innerHTML = `
        <form id="createListForm">
            <input type="text" id="listName" placeholder="Название списка" required />
            <div id="giftsContainer"></div>
            <button type="button" class="addGiftBtn">Добавить подарок</button>
            <button type="submit" class="saveListBtn">Сохранить лист</button>
        </form>
    `;

    const giftsContainer = document.getElementById('giftsContainer');
    const addGiftBtn = block.querySelector('.addGiftBtn');
    const form = block.querySelector('#createListForm');

    addGiftInput();

    addGiftBtn.onclick = () => {
        addGiftInput();
    };

    form.onsubmit = async e => {
        e.preventDefault();
        const listName = document.getElementById('listName').value.trim();
        if (!listName) {
            alert("Введите название списка!");
            return;
        }
        const giftBlocks = giftsContainer.querySelectorAll('.giftBlock');
        const gifts = [];
        for (const block of giftBlocks) {
            const nameInput = block.querySelector('.giftInputName');
            const linkInput = block.querySelector('.giftInputLink');
            const nameVal = nameInput.value.trim();
            let linkVal = linkInput.value.trim();
            if (nameVal) {
                // Проверка валидности ссылки: либо пустое, либо начинается с http:// или https://
                if (linkVal && !/^https?:\/\//i.test(linkVal)) {
                    alert("Ссылка должна начинаться с http:// или https:// или быть пустой");
                    return;
                }
                gifts.push({ name: nameVal, taken: false, link: linkVal });
            }
        }
        if (gifts.length === 0) {
            alert("Добавьте хотя бы один подарок!");
            return;
        }

        try {
            const response = await fetch('/api/create_list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: listName, wishlist: gifts })
            });
            if (!response.ok) throw new Error('Ошибка при сохранении');
            //alert('Список успешно сохранён!');
            selectedUserId = null;
            await loadUsers();
            renderWishlist();
            renderDeleteButton();
        } catch (err) {
            alert('Ошибка: ' + err.message);
        }
    };
}

function addGiftInput() {
    const giftsContainer = document.getElementById('giftsContainer');
    const block = document.createElement('div');
    block.className = 'giftBlock';
    block.style.marginBottom = '12px';
    block.style.display = 'flex';
    block.style.flexDirection = 'column';

    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.className = 'giftInputName';
    inputName.placeholder = `Подарок ${giftsContainer.children.length + 1}`;

    const inputLink = document.createElement('input');
    inputLink.type = 'text';
    inputLink.className = 'giftInputLink';
    inputLink.placeholder = 'Ссылка (опционально)';
    inputLink.style.marginTop = '4px';

    block.appendChild(inputName);
    block.appendChild(inputLink);

    giftsContainer.appendChild(block);
}

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            document.cookie = "username=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
            document.cookie = "user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
            window.location.href = '/login';
        };
    }

    const createListBtn = document.getElementById('createListBtn');
    if (createListBtn) {
        createListBtn.onclick = () => {
            selectedUserId = null;
            renderUsers();
            showCreateListForm();
        };
    }

    loadUsers();
});
