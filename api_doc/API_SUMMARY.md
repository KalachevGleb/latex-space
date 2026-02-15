# Документация по API Overleaf CE - Резюме

## Файлы и инструменты

### Документация

1. **[API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)** (полная документация)
   - Подробное описание всех API endpoints
   - Параметры запросов и форматы ответов
   - Примеры на Bash, Node.js и Python
   - Информация по безопасности и troubleshooting
   - **~600 строк**

2. **[API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)** (краткий справочник)
   - Таблицы всех endpoints
   - Быстрые примеры
   - Коды ответов и роли
   - **~150 строк**

3. **[API_README.md](API_README.md)** (руководство)
   - Быстрый старт
   - Установка зависимостей
   - Основные операции
   - Примеры использования
   - **~350 строк**

4. **API_SUMMARY.md** (этот файл)
   - Краткое описание всех компонентов

### Инструменты

5. **[api-example.sh](api-example.sh)** (Bash скрипт)
   - Интерактивный режим работы с API
   - Демонстрация всех возможностей
   - Готовые функции для использования в своих скриптах
   - **~650 строк**

6. **[overleaf_api.py](overleaf_api.py)** (Python модуль)
   - Полноценный Python клиент для Overleaf API
   - Классы `OverleafAPI` и `OverleafPrivateAPI`
   - Обработка ошибок и логирование
   - **~700 строк**

7. **[api_examples.py](api_examples.py)** (Python примеры)
   - 6 готовых примеров использования
   - Интерактивное меню
   - Демонстрация всех возможностей
   - **~500 строк**

8. **[requirements_api.txt](requirements_api.txt)**
   - Зависимости для Python клиента

## Быстрый старт

### Вариант 1: Bash скрипт (самый простой)

```bash
# Демонстрация
./api-example.sh demo

# Интерактивный режим
./api-example.sh

# Использование в своих скриптах
source api-example.sh
login
PROJECT_ID=$(create_project "My Project")
compile_project "$PROJECT_ID"
logout
```

### Вариант 2: Python модуль

```bash
# Установка зависимостей
pip install -r requirements_api.txt

# Запуск примеров
python api_examples.py

# Использование в своём коде
python3
>>> from overleaf_api import OverleafAPI
>>> api = OverleafAPI('http://localhost:3000', 'user@email.com', 'pass')
>>> project_id = api.create_project('Test')
>>> print(project_id)
```

### Вариант 3: Прямые HTTP запросы

См. примеры в [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)

## Основные категории API

### 1. Аутентификация

```http
POST /login          # Вход
POST /logout         # Выход
GET  /dev/csrf       # CSRF token
```

**Типы аутентификации:**
- Web API: Cookies + CSRF token
- Private API: HTTP Basic Auth

### 2. Проекты

| Операция | Endpoint |
|----------|----------|
| Создать | `POST /project/new` |
| Список | `GET /user/projects` |
| Переименовать | `POST /project/:id/rename` |
| Удалить | `DELETE /Project/:id` |
| Клонировать | `POST /Project/:id/clone` |
| Архивировать | `POST /Project/:id/archive` |
| В корзину | `POST /project/:id/trash` |
| Структура | `GET /project/:id/entities` |

### 3. Участники

| Операция | Endpoint |
|----------|----------|
| Список | `GET /project/:id/members` |
| Пригласить | `POST /project/:id/invite` |
| Изменить роль | `PUT /project/:id/users/:user_id` |
| Удалить | `DELETE /project/:id/users/:user_id` |

**Роли:**
- `owner` - Владелец
- `readAndWrite` - Редактор
- `readOnly` - Только чтение
- `review` - Рецензент

### 4. Компиляция

| Операция | Endpoint |
|----------|----------|
| Компилировать | `POST /project/:id/compile` |
| Остановить | `POST /project/:id/compile/stop` |
| Скачать PDF | `GET /download/project/:id/build/:build/output/output.pdf` |
| Скачать файл | `GET /project/:id/build/:build/output/:filename` |

### 5. Защита проектов и файлов

| Операция | Endpoint |
|----------|----------|
| Статус защиты проекта | `GET /api/project/:id/protection` |
| Установить защиту проекта | `POST /api/project/:id/protection` |
| Список защищённых файлов | `GET /api/project/:id/protected-files` |
| Установить защищённые файлы | `POST /api/project/:id/protected-files` |

**Возможности:**
- Защищённые проекты нельзя удалить
- Защищённые файлы нельзя удалить, переименовать или изменить (read-only)
- Управление доступно только владельцу проекта (owner)

### 6. Управление правами пользователей

| Операция | Endpoint |
|----------|----------|
| Получить права пользователя | `GET /api/user/:user_id/permissions` |
| Установить права пользователя | `POST /api/user/:user_id/permissions` |

**Уровни прав:**
- `full` - Полные права (по умолчанию)
- `basic` - Базовые права: просмотр, редактирование, компиляция (без создания/загрузки/копирования/удаления проектов)

### 7. Private API

| Операция | Endpoint |
|----------|----------|
| Детали проекта | `GET /internal/project/:id` |
| Получить документ | `GET /project/:id/doc/:doc_id` |
| Обновить документ | `POST /project/:id/doc/:doc_id` |
| Скачать ZIP | `GET /internal/project/:id/zip` |

## Примеры использования

### Создать проект и скомпилировать (Bash)

```bash
source api-example.sh

# Войти
login

# Создать проект
PROJECT_ID=$(create_project "My LaTeX Document")
echo "Project ID: $PROJECT_ID"

# Подождать инициализации
sleep 2

# Компилировать
BUILD_ID=$(compile_project "$PROJECT_ID")
echo "Build ID: $BUILD_ID"

# Скачать PDF
download_pdf "$PROJECT_ID" "$BUILD_ID" "document.pdf"

# Выйти
logout
```

### Пригласить участника и изменить роль (Python)

```python
from overleaf_api import OverleafAPI

# Войти
api = OverleafAPI('http://localhost:3000', 'owner@example.com', 'password')

# Создать проект
project_id = api.create_project('Collaborative Project')

# Пригласить участника
api.invite_collaborator(project_id, 'colleague@example.com', 'readAndWrite')

# Получить список участников
members = api.get_members(project_id)
for member in members:
    print(f"{member['email']}: {member['privileges']}")
    
    # Изменить роль на readOnly
    if member['email'] == 'colleague@example.com':
        api.change_member_role(project_id, member['_id'], 'readOnly')

api.logout()
```

### Работа с документами через Private API (Python)

```python
from overleaf_api import OverleafPrivateAPI

# Private API клиент
api = OverleafPrivateAPI(
    base_url='http://localhost:3000',
    username='overleaf',
    password='password'
)

# Получить детали проекта
project = api.get_project_details(project_id)

# Получить документ
doc_id = project['rootFolder'][0]['docs'][0]['_id']
doc = api.get_document(project_id, doc_id)

print(f"Документ {doc['name']}:")
for i, line in enumerate(doc['lines'], 1):
    print(f"{i}: {line}")

# Обновить документ
new_lines = doc['lines'] + ["% Добавлено через API"]
api.update_document(project_id, doc_id, new_lines, doc['version'] + 1)
```

### Полный workflow (Python)

```python
from overleaf_api import OverleafAPI
import time

api = OverleafAPI('http://localhost:3000', 'user@example.com', 'password')

# 1. Создать проект
project_id = api.create_project('Complete Workflow')
print(f"✓ Проект создан: {project_id}")

# 2. Переименовать
api.rename_project(project_id, 'Complete Workflow (v2)')
print("✓ Переименован")

# 3. Пригласить участника
try:
    api.invite_collaborator(project_id, 'colleague@example.com', 'readAndWrite')
    print("✓ Участник приглашён")
except Exception as e:
    print(f"⚠ Приглашение не удалось: {e}")

# 4. Компилировать
time.sleep(2)
build_id = api.compile_project(project_id)
print(f"✓ Скомпилировано: {build_id}")

# 5. Скачать результаты
api.download_pdf(project_id, build_id, 'result.pdf')
api.download_output_file(project_id, build_id, 'output.log')
print("✓ Файлы скачаны")

# 6. Клонировать
cloned_id = api.clone_project(project_id, 'Cloned Workflow')
print(f"✓ Клонирован: {cloned_id}")

# 7. Архивировать клон
api.archive_project(cloned_id)
print("✓ Клон архивирован")

# 8. Очистка
api.delete_project(project_id)
api.delete_project(cloned_id)
print("✓ Проекты удалены")

api.logout()
```

## Безопасность

### Важные рекомендации:

1. **Используйте HTTPS** в production
2. **Храните credentials в переменных окружения:**
   ```bash
   export OVERLEAF_URL="https://your-server.com"
   export OVERLEAF_EMAIL="user@example.com"
   export OVERLEAF_PASSWORD="secure_password"
   ```

3. **Измените пароли Private API** в `services/web/config/settings.defaults.js`:
   ```javascript
   httpAuthUsers: {
     'your-username': 'strong-password-here'
   }
   ```

4. **Не коммитьте credentials** в git:
   ```bash
   # .gitignore
   cookies.txt
   *.env
   .env.local
   ```

## Ограничения

### Rate Limits

| Операция | Лимит |
|----------|-------|
| Login | 20/мин (IP), 10/2мин (email) |
| Создание проекта | 20/мин |
| Компиляция | 800/час |
| Приглашения | 10 × лимит коллабораторов / 30 мин |

При превышении: `429 Too Many Requests`

### Отсутствие публичного API

Overleaf CE **не предоставляет** публичный API endpoint для:
- Создания пользователей
- Административных операций
- Прямого доступа к базе данных

Для создания пользователей используйте:
1. Web интерфейс регистрации (если включен)
2. Программное создание через Node.js модули
3. Прямую работу с MongoDB (dev only)

## Troubleshooting

### 403 Forbidden
**Причина:** Отсутствует CSRF token  
**Решение:** Получите token перед запросом:
```bash
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3000/dev/csrf)
```

### 401 Unauthorized
**Причина:** Истекла сессия или неверные credentials  
**Решение:** Войдите заново

### 429 Too Many Requests
**Причина:** Превышен rate limit  
**Решение:** Уменьшите частоту запросов

### Connection refused
**Причина:** Overleaf не запущен  
**Решение:**
```bash
cd /Users/gleb/Projects/overleaf
bin/dev up
```

### jq: command not found
**Решение:**
```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

## Дополнительные ресурсы

- **Полная документация:** [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)
- **Краткий справочник:** [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)
- **Руководство:** [API_README.md](API_README.md)
- **Overleaf Wiki:** https://github.com/overleaf/overleaf/wiki
- **GitHub Issues:** https://github.com/overleaf/overleaf/issues

## Возможные применения

### Автоматизация создания проектов для студентов

```python
from overleaf_api import OverleafAPI

api = OverleafAPI('http://localhost:3000', 'teacher@university.edu', 'password')

students = ['student1@uni.edu', 'student2@uni.edu', 'student3@uni.edu']

for student in students:
    # Создать проект
    project_id = api.create_project(f'Homework - {student}')
    
    # Пригласить студента
    api.invite_collaborator(project_id, student, 'readAndWrite')
    
    print(f"✓ Проект для {student}: {project_id}")

api.logout()
```

### Пакетная компиляция проектов

```bash
#!/bin/bash
source api-example.sh

login

# Получить все проекты
PROJECTS=$(get_projects | awk '{print $NF}' | tr -d '()')

# Компилировать каждый
for PROJECT_ID in $PROJECTS; do
    echo "Компиляция $PROJECT_ID..."
    BUILD_ID=$(compile_project "$PROJECT_ID" 2>/dev/null) || continue
    download_pdf "$PROJECT_ID" "$BUILD_ID" "${PROJECT_ID}.pdf"
done

logout
```

### Резервное копирование проектов

```python
from overleaf_api import OverleafAPI, OverleafPrivateAPI
import json
from pathlib import Path

# Web API для списка проектов
api = OverleafAPI('http://localhost:3000', 'user@example.com', 'password')
projects = api.list_projects()

# Private API для детального доступа
private_api = OverleafPrivateAPI()

backup_dir = Path('backups')
backup_dir.mkdir(exist_ok=True)

for project in projects:
    project_id = project['_id']
    project_name = project['name']
    
    # Получить полную структуру
    details = private_api.get_project_details(project_id)
    
    # Сохранить метаданные
    meta_file = backup_dir / f'{project_id}_meta.json'
    with open(meta_file, 'w', encoding='utf-8') as f:
        json.dump(details, f, indent=2, ensure_ascii=False)
    
    # Скачать документы
    for doc in details['rootFolder'][0].get('docs', []):
        doc_content = private_api.get_document(project_id, doc['_id'])
        doc_file = backup_dir / f'{project_id}_{doc["name"]}'
        with open(doc_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(doc_content['lines']))
    
    print(f"✓ {project_name} backed up")

api.logout()
```