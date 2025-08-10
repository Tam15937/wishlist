import time
import json
import os
from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
from flask_socketio import SocketIO
from threading import RLock

app = Flask(__name__, static_folder='.')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

wishlist_lock = RLock()
DATA_FILE = 'wishlists.json'
AUTH_FILE = 'users_auth.json'

# Загрузка пользователей для аутентификации (username -> {password, id})
if os.path.exists(AUTH_FILE):
    with open(AUTH_FILE, 'r', encoding='utf-8') as f:
        users_auth = json.load(f)
else:
    users_auth = {}

# Загрузка wishlists (списки пожеланий)
if os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        wishlists = json.load(f)
else:
    wishlists = []

def save_users_auth():
    try:
        with open(AUTH_FILE, 'w', encoding='utf-8') as f:
            json.dump(users_auth, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка при записи auth файла: {e}")

def save_wishlists():
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(wishlists, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка при записи wishlists файла: {e}")

def is_authenticated():
    username = request.cookies.get('username')
    user_id = request.cookies.get('user_id')
    if not username or not user_id:
        return False
    if username not in users_auth:
        return False
    try:
        if str(users_auth[username]['id']) != user_id:
            return False
    except KeyError:
        return False
    return True

@app.before_request
def log_request_info():
    print(f"Получен {request.method} запрос на {request.path}")

# --- Аутентификация ---

@app.route('/login', methods=['GET'])
def login_page():
    return send_from_directory('.', 'login.html')

@app.route('/login', methods=['POST'])
def login_post():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Имя и пароль обязательны'}), 400

    username = data['username'].strip()
    password = data['password']
    if not username or not password:
        return jsonify({'error': 'Имя и пароль обязательны'}), 400

    # Если пользователь существует
    if username in users_auth:
        if users_auth[username]['password'] == password:
            resp = jsonify({'status': 'ok', 'message': 'Вход успешен'})
            resp.set_cookie('username', username)
            resp.set_cookie('user_id', str(users_auth[username]['id']))
            return resp
        else:
            return jsonify({'error': 'Неверный пароль'}), 403
    else:
        # Создаем нового пользователя
        new_id = int(time.time() * 1000)  # Простое уникальное число
        users_auth[username] = {
            'password': password,
            'id': new_id
        }
        save_users_auth()
        resp = jsonify({'status': 'ok', 'message': 'Пользователь создан и вошёл'})
        resp.set_cookie('username', username)
        resp.set_cookie('user_id', str(new_id))
        return resp

@app.route('/')
def index():
    if not is_authenticated():
        return redirect('/login')

    user_agent = request.headers.get('User-Agent', '').lower()

    # Простая проверка на мобильный браузер
    is_mobile = any(mob in user_agent for mob in [
        'iphone', 'android', 'blackberry', 'mobile', 'ipad', 'ipod'
    ])

    # Также можно проверить ширину экрана, если передадите в заголовках
    # Но ширину лучше определить на клиенте

    if is_mobile:
        return send_from_directory('.', 'index_mobile.html')
    else:
        return send_from_directory('.', 'index.html')

@app.route('/style.css')
def style_css():
    return send_from_directory('.', 'style.css')

@app.route('/script.js')
def script_js():
    return send_from_directory('.', 'script.js')
    
@app.route('/mobile_style.css')
def mobile_style_css():
    return send_from_directory('.', 'mobile_style.css')

@app.route('/mobile_script.js')
def mobile_script_js():
    return send_from_directory('.', 'mobile_script.js')

# --- API ---

@app.route('/api/users', methods=['GET'])
def get_users():
    if not is_authenticated():
        return jsonify({'error': 'Неавторизован'}), 403

    with wishlist_lock:
        # возвращаем список отдельных wishlist (каждый со своим id)
        safe_lists = []
        for w in wishlists:
            safe_lists.append({
                'id': w['id'],
                'name': w['name'],
                'wishlist': w['wishlist'],
                'username': w['username'],
                'user_id': w['user_id']
            })
        return jsonify(safe_lists)

@app.route('/api/create_list', methods=['POST'])
def create_list():
    if not is_authenticated():
        return jsonify({'error': 'Неавторизован'}), 403

    data = request.get_json()
    if not data or 'name' not in data or 'wishlist' not in data:
        return jsonify({'error': 'Некорректные данные'}), 400

    username = request.cookies.get('username')
    user_id = users_auth[username]['id']

    try:
        new_list = {
            'id': int(time.time() * 1000),   # уникальный id списка
            'name': data['name'],
            'wishlist': data['wishlist'],
            'user_id': user_id,
            'username': username             # для удобства
        }
        with wishlist_lock:
            wishlists.append(new_list)
            save_wishlists()

        socketio.emit('update')
        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        print(f"Ошибка в create_list: {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500

@app.route('/api/delete_list/<int:list_id>', methods=['POST'])
def delete_list(list_id):
    if not is_authenticated():
        return jsonify({'error': 'Неавторизован'}), 403

    current_username = request.cookies.get('username')

    with wishlist_lock:
        for i, w in enumerate(wishlists):
            if w['id'] == list_id:
                if w['username'] != current_username:
                    return jsonify({'error': 'Недостаточно прав для удаления списка'}), 403
                wishlists.pop(i)
                save_wishlists()
                socketio.emit('update')
                return jsonify({'status': 'deleted'}), 200

        return jsonify({'error': 'Список не найден'}), 404

@app.route('/api/toggle_item/<int:list_id>/<int:item_index>', methods=['POST'])
def toggle_item(list_id, item_index):
    if not is_authenticated():
        return jsonify({'error': 'Неавторизован'}), 403

    current_user = request.cookies.get('username')
    current_user_id = users_auth[current_user]['id']

    with wishlist_lock:
        for w in wishlists:
            if w['id'] == list_id:
                if 0 <= item_index < len(w['wishlist']):
                    item = w['wishlist'][item_index]
                    current_taken = item.get('taken', False)
                    new_taken = not current_taken

                    # Проверяем логику прав:
                    if current_taken and new_taken == False:
                        # Снимают галочку — можно только если current_user_id == taken_by_user_id
                        taken_by = item.get('taken_by_user_id')
                        if taken_by != current_user_id:
                            return jsonify({'error': 'Недостаточно прав для снятия отметки'}), 403
                        # Разрешаем снять отметку
                        item['taken'] = False
                        item.pop('taken_by_user_id', None)

                    elif not current_taken and new_taken == True:
                        # Любой может поставить отметку, записываем current_user_id
                        item['taken'] = True
                        item['taken_by_user_id'] = current_user_id

                    else:
                        # В остальных случаях (например, toggle с true на true) — просто игнорируем или возвращаем ошибку
                        # Здесь можно либо игнорировать (не менять), либо вернуть ошибку
                        # Мы сделаем игнор, чтобы не ломать логику
                        pass

                    save_wishlists()
                    socketio.emit('update')
                    return jsonify({'status': 'ok'}), 200
                else:
                    return jsonify({'error': 'Индекс вне диапазона'}), 400

        return jsonify({'error': 'Список не найден'}), 404
        
@socketio.on('connect')
def on_connect():
    print('Клиент подключился')

@socketio.on('disconnect')
def on_disconnect():
    print('Клиент отключился')

if __name__ == '__main__':
    print("Запуск сервера на http://0.0.0.0:8080")
    socketio.run(app, host='0.0.0.0', port=8080)
