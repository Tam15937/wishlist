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
        console.log('Полученные списки:', users);
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
            selectedUserId = user.id; // id списка
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
    let html = `<h2>Wishlist: ${user.name}</h2><ul>`;
    user.wishlist.forEach((item, index) => {
        const checked = item.taken ? 'checked' : '';
        html += `<li>
            <label>
                <input type="checkbox" data-index="${index}" ${checked} />
                <span class="${item.taken ? 'taken' : ''}">${item.name}</span>
            </label>
        </li>`;
    });
    html += '</ul>';
    block.innerHTML = html;

	block.querySelectorAll('input[type=checkbox]').forEach(checkbox => {
		checkbox.addEventListener('change', async (e) => {
			const idx = e.target.getAttribute('data-index');
			try {
				const res = await fetch(`/api/toggle_item/${selectedUserId}/${idx}`, {
					method: 'POST'
				});
				if (!res.ok) {
					// Попытка получить сообщение об ошибке из тела ответа
					let errorMsg = 'Ошибка при отметке подарка';
					try {
						const data = await res.json();
						if (data && data.error) {
							errorMsg = data.error;
						}
					} catch (_) {
						// Не удалось распарсить JSON — оставляем общее сообщение
					}
					throw new Error(errorMsg);
				}
				// Обновление придёт через WebSocket, здесь ничего не делаем
			} catch (err) {
				alert(err.message);
				// Откатываем состояние чекбокса при ошибке
				e.target.checked = !e.target.checked;
			}
		});
	});
}

function getCookie(name) {
    const cookieStr = document.cookie;
    const cookies = cookieStr.split('; ').reduce((acc, current) => {
        const [key, val] = current.split('=');
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
    btn.style.backgroundColor = '#e53935';
    btn.style.marginTop = '10px';
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
            alert('Список успешно удалён');
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

    form.onsubmit = async (e) => {
        e.preventDefault();
        const listName = document.getElementById('listName').value.trim();
        if (!listName) {
            alert("Введите название списка!");
            return;
        }
        const giftInputs = giftsContainer.querySelectorAll('.giftInput');
        const gifts = [];
        for (const input of giftInputs) {
            const val = input.value.trim();
            if (val) gifts.push({ name: val, taken: false });
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
            alert('Список успешно сохранён!');
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
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'giftInput';
    input.placeholder = `Подарок ${giftsContainer.children.length + 1}`;
    giftsContainer.appendChild(input);
}

document.getElementById('createListBtn').onclick = () => {
    selectedUserId = null;
    renderUsers();
    showCreateListForm();
};

// Инициализация
loadUsers();
