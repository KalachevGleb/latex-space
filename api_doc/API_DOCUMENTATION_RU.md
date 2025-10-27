# Документация по API Overleaf CE

## Оглавление
1. [Базовая информация](#базовая-информация)
2. [Аутентификация](#аутентификация)
3. [Управление пользователями](#управление-пользователями)
4. [Управление проектами](#управление-проектами)
5. [Управление участниками проекта](#управление-участниками-проекта)
6. [Компиляция и скачивание](#компиляция-и-скачивание)
7. [Private API](#private-api)
8. [Примеры использования](#примеры-использования)

---

## Базовая информация

### URL по умолчанию
```
http://localhost:3000
```

### Форматы данных
- **Request**: `application/json` или `application/x-www-form-urlencoded`
- **Response**: `application/json`

### Стандартные коды ответов
- `200` - Успех
- `204` - Успех без содержимого
- `400` - Неверный запрос
- `401` - Требуется аутентификация
- `403` - Доступ запрещён
- `404` - Не найдено
- `429` - Превышен лимит запросов
- `500` - Внутренняя ошибка сервера

---

## Аутентификация

### Вход (Login)
```http
POST /login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Ответ:**
```json
{
  "redir": "/project"
}
```

### Выход (Logout)
```http
POST /logout
```

### CSRF Token
Для POST/PUT/DELETE запросов требуется CSRF token в заголовке:
```http
X-CSRF-Token: <token>
```

Получить токен:
```http
GET /dev/csrf
```

### Private API аутентификация

Private API endpoints требуют HTTP Basic Authentication:
```http
Authorization: Basic <base64(username:password)>
```

Учётные данные берутся из настроек `httpAuthUsers` в `settings.defaults.js`.

---

## Управление пользователями

### Создание пользователя (через код)

Overleaf CE не предоставляет публичный API endpoint для создания пользователей. Создание выполняется программно через `UserRegistrationHandler`:

```javascript
// Пример использования в коде
const UserRegistrationHandler = require('./app/src/Features/User/UserRegistrationHandler')

const user = await UserRegistrationHandler.promises.registerNewUser({
  email: 'newuser@example.com',
  password: 'secure_password',
  first_name: 'John',
  last_name: 'Doe'
})
```

Альтернативно через MongoDB напрямую (для административных целей):
```javascript
const UserCreator = require('./app/src/Features/User/UserCreator')
const AuthenticationManager = require('./app/src/Features/Authentication/AuthenticationManager')

// Создать пользователя
const user = await UserCreator.promises.createNewUser({
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User'
})

// Установить пароль
await AuthenticationManager.promises.setUserPassword(user, 'password123')
```

### Получить информацию о текущем пользователе
```http
GET /user/personal_info
```

**Ответ:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

### Изменить настройки пользователя
```http
POST /user/settings
Content-Type: application/json

{
  "first_name": "Jane",
  "last_name": "Smith",
  "editorTheme": "dracula",
  "fontSize": 14
}
```

### Изменить пароль
```http
POST /user/password/update
Content-Type: application/json

{
  "currentPassword": "oldpass123",
  "newPassword1": "newpass456",
  "newPassword2": "newpass456"
}
```

---

## Управление проектами

### Получить список проектов
```http
GET /user/projects
```

**Ответ:**
```json
{
  "projects": [
    {
      "_id": "60a7b1234567890abcdef123",
      "name": "My Project",
      "owner_ref": "507f1f77bcf86cd799439011",
      "lastUpdated": "2024-01-15T10:30:00.000Z",
      "accessLevel": "owner"
    }
  ]
}
```

### Создать новый проект
```http
POST /project/new
Content-Type: application/json

{
  "projectName": "New Project",
  "template": "basic"
}
```

**Параметры:**
- `projectName` - название проекта
- `template` - `"basic"` или `"example"` (необязательно)

**Ответ:**
```json
{
  "project_id": "60a7b1234567890abcdef123",
  "owner_ref": "507f1f77bcf86cd799439011",
  "owner": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "user@example.com",
    "_id": "507f1f77bcf86cd799439011"
  }
}
```

### Переименовать проект
```http
POST /project/:Project_id/rename
Content-Type: application/json

{
  "newProjectName": "Updated Project Name"
}
```

### Получить структуру проекта
```http
GET /project/:Project_id/entities
```

**Ответ:**
```json
{
  "project_id": "60a7b1234567890abcdef123",
  "rootFolder": [
    {
      "_id": "folder_id",
      "name": "root",
      "folders": [],
      "docs": [
        {
          "_id": "doc_id",
          "name": "main.tex"
        }
      ],
      "fileRefs": []
    }
  ]
}
```

### Клонировать проект
```http
POST /Project/:Project_id/clone
Content-Type: application/json

{
  "projectName": "Cloned Project"
}
```

### Архивировать проект
```http
POST /Project/:Project_id/archive
```

### Разархивировать проект
```http
DELETE /Project/:Project_id/archive
```

### Переместить в корзину
```http
POST /project/:project_id/trash
```

### Восстановить из корзины
```http
DELETE /project/:project_id/trash
```

### Удалить проект навсегда
```http
DELETE /Project/:Project_id
```

⚠️ **Внимание**: Удаление проекта необратимо и требует прав администратора проекта (owner).

### Скачать проект как ZIP
```http
GET /Project/:Project_id/download/zip
```

---

## Управление участниками проекта

### Роли участников (Privilege Levels)
- `readAndWrite` - Редактор (может редактировать проект)
- `readOnly` - Только чтение
- `review` - Рецензент (может оставлять комментарии и track changes)

### Получить список участников
```http
GET /project/:Project_id/members
```

**Ответ:**
```json
{
  "members": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "email": "owner@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "privileges": "owner"
    },
    {
      "_id": "507f1f77bcf86cd799439022",
      "email": "collaborator@example.com",
      "first_name": "Jane",
      "last_name": "Smith",
      "privileges": "readAndWrite"
    }
  ]
}
```

### Пригласить участника
```http
POST /project/:Project_id/invite
Content-Type: application/json

{
  "email": "newuser@example.com",
  "privileges": "readAndWrite"
}
```

**Параметры:**
- `email` - email пользователя
- `privileges` - `"readAndWrite"`, `"readOnly"` или `"review"`
- `isAnonymous` - `true/false` (необязательно, для анонимных рецензентов)

**Ответ:**
```json
{
  "invite": {
    "_id": "invite_id",
    "email": "newuser@example.com",
    "privileges": "readAndWrite",
    "projectId": "60a7b1234567890abcdef123",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Примечание:** Этот метод создаёт приглашение, которое пользователь должен принять. Для прямого добавления пользователя без приглашения используйте `/project/:Project_id/add`.

### Добавить участника напрямую (без приглашения)
```http
POST /project/:Project_id/add
Content-Type: application/json

{
  "email": "existinguser@example.com",
  "privileges": "readAndWrite"
}
```

**Параметры:**
- `email` - email существующего пользователя (должен быть зарегистрирован в системе)
- `privileges` - `"readAndWrite"`, `"readOnly"` или `"review"`
- `isAnonymous` - `true/false` (необязательно, для анонимных рецензентов)

**Ответ при успехе (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439022",
    "email": "existinguser@example.com",
    "privileges": "readAndWrite"
  }
}
```

**Возможные ошибки:**
- `400` - `{"error": "cannot_add_self"}` - попытка добавить себя
- `400` - `{"error": "invalid_email"}` - некорректный email
- `400` - `{"error": "user_already_member"}` - пользователь уже участник проекта
- `403` - `{"error": "collaborator_limit_reached"}` - достигнут лимит участников
- `404` - `{"error": "user_not_found"}` - пользователь с таким email не найден

**Отличия от `/invite`:**
- `/invite` - создаёт приглашение, отправляет email, пользователь должен принять
- `/add` - сразу добавляет пользователя в проект, требует чтобы пользователь был зарегистрирован

### Получить список приглашений
```http
GET /project/:Project_id/invites
```

### Отозвать приглашение
```http
DELETE /project/:Project_id/invite/:invite_id
```

### Изменить роль участника
```http
PUT /project/:Project_id/users/:user_id
Content-Type: application/json

{
  "privilegeLevel": "readOnly"
}
```

**Параметры:**
- `privilegeLevel` - `"readAndWrite"`, `"readOnly"` или `"review"`

### Удалить участника из проекта
```http
DELETE /project/:Project_id/users/:user_id
```

### Передать права владельца
```http
POST /project/:Project_id/transfer-ownership
Content-Type: application/json

{
  "user_id": "507f1f77bcf86cd799439022"
}
```

### Покинуть проект (самостоятельно)
```http
POST /project/:Project_id/leave
```

---

## Компиляция и скачивание

### Запустить компиляцию
```http
POST /project/:Project_id/compile
Content-Type: application/json

{
  "rootDoc_id": "doc_id",
  "draft": false,
  "check": "silent",
  "incrementalCompilesEnabled": true,
  "stopOnFirstError": false
}
```

**Параметры** (все необязательные):
- `rootDoc_id` - ID главного документа
- `draft` - черновой режим
- `check` - проверка синтаксиса
- `incrementalCompilesEnabled` - инкрементальная компиляция
- `stopOnFirstError` - остановка при первой ошибке

**Ответ:**
```json
{
  "status": "success",
  "outputFiles": [
    {
      "path": "output.pdf",
      "build": "build_id",
      "url": "/project/60a7b.../build/build_id/output/output.pdf",
      "type": "pdf"
    },
    {
      "path": "output.log",
      "build": "build_id",
      "url": "/project/60a7b.../build/build_id/output/output.log",
      "type": "log"
    }
  ],
  "buildId": "build_id",
  "pdfDownloadDomain": "http://localhost:3000"
}
```

### Остановить компиляцию
```http
POST /project/:Project_id/compile/stop
```

### Скачать PDF
```http
GET /download/project/:Project_id/build/:build_id/output/output.pdf
```

### Скачать выходной файл
```http
GET /project/:Project_id/build/:build_id/output/:filename
```

### Скачать лог компиляции
```http
GET /project/:Project_id/build/:build_id/output/output.log
```

### Подсчёт слов
```http
GET /project/:Project_id/wordcount
```

---

## Private API

Private API endpoints требуют HTTP Basic Authentication. Учётные данные настраиваются в `settings.defaults.js` в `httpAuthUsers`.

### Получить детали проекта
```http
GET /internal/project/:project_id
Authorization: Basic <credentials>
```

**Ответ:**
```json
{
  "_id": "60a7b1234567890abcdef123",
  "name": "My Project",
  "owner_ref": "507f1f77bcf86cd799439011",
  "rootFolder": [...],
  "compiler": "pdflatex",
  "spellCheckLanguage": "ru",
  "track_changes": {}
}
```

### Получить документ
```http
GET /project/:Project_id/doc/:doc_id
Authorization: Basic <credentials>
```

**Ответ:**
```json
{
  "_id": "doc_id",
  "name": "main.tex",
  "lines": [
    "\\documentclass{article}",
    "\\begin{document}",
    "Hello World!",
    "\\end{document}"
  ],
  "version": 5,
  "pathname": "/main.tex"
}
```

### Обновить документ
```http
POST /project/:Project_id/doc/:doc_id
Authorization: Basic <credentials>
Content-Type: application/json

{
  "lines": [
    "\\documentclass{article}",
    "\\begin{document}",
    "Updated content",
    "\\end{document}"
  ],
  "version": 6,
  "ranges": {}
}
```

### Скачать проект (ZIP)
```http
GET /internal/project/:Project_id/zip
Authorization: Basic <credentials>
```

### Компилировать и скачать PDF
```http
GET /internal/project/:project_id/compile/pdf
Authorization: Basic <credentials>
```

### Получить информацию о пользователе
```http
GET /user/:user_id/personal_info
Authorization: Basic <credentials>
```

---

## Примеры использования

### Пример 1: Создание проекта и приглашение участника

```bash
#!/bin/bash

# Получить CSRF token
CSRF_TOKEN=$(curl -s http://localhost:3000/dev/csrf)

# Войти в систему
SESSION=$(curl -s -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user@example.com","password":"password123"}' \
  http://localhost:3000/login)

# Создать новый проект
PROJECT_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"projectName":"API Test Project"}' \
  http://localhost:3000/project/new)

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.project_id')
echo "Created project: $PROJECT_ID"

# Пригласить участника (отправляет приглашение)
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"collaborator@example.com","privileges":"readAndWrite"}' \
  http://localhost:3000/project/$PROJECT_ID/invite

echo "Invited collaborator"

# ИЛИ добавить участника напрямую (без приглашения, для существующих пользователей)
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"existinguser@example.com","privileges":"readAndWrite"}' \
  http://localhost:3000/project/$PROJECT_ID/add

echo "Added collaborator directly"
```

### Пример 2: Компиляция проекта

```bash
#!/bin/bash

# Предполагается, что cookies.txt уже содержит активную сессию
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3000/dev/csrf)

PROJECT_ID="60a7b1234567890abcdef123"

# Запустить компиляцию
COMPILE_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"incrementalCompilesEnabled":true}' \
  http://localhost:3000/project/$PROJECT_ID/compile)

BUILD_ID=$(echo $COMPILE_RESPONSE | jq -r '.buildId')
echo "Build ID: $BUILD_ID"

# Скачать PDF
curl -s -b cookies.txt \
  -o output.pdf \
  http://localhost:3000/download/project/$PROJECT_ID/build/$BUILD_ID/output/output.pdf

echo "Downloaded PDF"
```

### Пример 3: Использование Private API (Node.js)

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const AUTH = {
  username: 'overleaf',
  password: 'password' // из settings.defaults.js httpAuthUsers
};

async function getProjectDetails(projectId) {
  const response = await axios.get(
    `${BASE_URL}/internal/project/${projectId}`,
    { auth: AUTH }
  );
  return response.data;
}

async function getDocument(projectId, docId) {
  const response = await axios.get(
    `${BASE_URL}/project/${projectId}/doc/${docId}`,
    { auth: AUTH }
  );
  return response.data;
}

async function updateDocument(projectId, docId, lines, version) {
  const response = await axios.post(
    `${BASE_URL}/project/${projectId}/doc/${docId}`,
    {
      lines,
      version,
      ranges: {}
    },
    { auth: AUTH }
  );
  return response.data;
}

// Использование
(async () => {
  try {
    const project = await getProjectDetails('60a7b1234567890abcdef123');
    console.log('Project:', project.name);
    
    const doc = await getDocument(project._id, 'doc_id_here');
    console.log('Document lines:', doc.lines);
    
    // Обновить документ
    const updatedLines = [
      '\\documentclass{article}',
      '\\begin{document}',
      'Updated via API',
      '\\end{document}'
    ];
    await updateDocument(project._id, doc._id, updatedLines, doc.version + 1);
    console.log('Document updated');
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
```

### Пример 4: Python - создание пользователя и проекта

```python
import requests

BASE_URL = 'http://localhost:3000'

class OverleafAPI:
    def __init__(self, email, password):
        self.session = requests.Session()
        self.email = email
        self.password = password
        self.csrf_token = None
        
    def login(self):
        # Получить CSRF token
        response = self.session.get(f'{BASE_URL}/dev/csrf')
        self.csrf_token = response.text.strip()
        
        # Войти
        response = self.session.post(
            f'{BASE_URL}/login',
            json={'email': self.email, 'password': self.password},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()
    
    def create_project(self, name):
        response = self.session.post(
            f'{BASE_URL}/project/new',
            json={'projectName': name},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()
    
    def invite_collaborator(self, project_id, email, privileges='readAndWrite'):
        response = self.session.post(
            f'{BASE_URL}/project/{project_id}/invite',
            json={'email': email, 'privileges': privileges},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()
    
    def change_role(self, project_id, user_id, privilege_level):
        response = self.session.put(
            f'{BASE_URL}/project/{project_id}/users/{user_id}',
            json={'privilegeLevel': privilege_level},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.status_code == 204
    
    def get_members(self, project_id):
        response = self.session.get(
            f'{BASE_URL}/project/{project_id}/members',
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()
    
    def remove_member(self, project_id, user_id):
        response = self.session.delete(
            f'{BASE_URL}/project/{project_id}/users/{user_id}',
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.status_code == 204

# Использование
api = OverleafAPI('user@example.com', 'password123')
api.login()

# Создать проект
project = api.create_project('My New Project')
project_id = project['project_id']
print(f'Created project: {project_id}')

# Пригласить участника
invite = api.invite_collaborator(project_id, 'colleague@example.com', 'readAndWrite')
print(f'Invited: {invite}')

# Получить список участников
members = api.get_members(project_id)
print(f'Members: {members}')

# Изменить роль участника
for member in members['members']:
    if member['email'] == 'colleague@example.com':
        api.change_role(project_id, member['_id'], 'readOnly')
        print(f'Changed role for {member["email"]} to readOnly')

# Удалить участника
for member in members['members']:
    if member['email'] == 'colleague@example.com':
        api.remove_member(project_id, member['_id'])
        print(f'Removed {member["email"]} from project')
```

---

## Дополнительная информация

### Rate Limiting

Многие endpoints имеют ограничения на частоту запросов:
- Создание проекта: 20 запросов/минута
- Приглашение участников: зависит от лимита collaborators (10 * количество_разрешённых_коллабораторов / 30 минут)
- Компиляция: 800 запросов/час на проект
- Login: 20 попыток/минута с IP, 10 попыток/2 минуты на email

### Управление системными настройками (admin)

Требует прав администратора (`isAdmin: true` в User model).

```http
POST /admin/registration/toggle
Content-Type: application/json

{
  "enabled": true
}
```

```http
POST /admin/settings/defaultLanguage
Content-Type: application/json

{
  "language": "ru"
}
```

### WebSocket API

Для real-time редактирования используется Socket.IO на `http://localhost:3000`:
- События: `joinProject`, `leaveProject`, `clientTracking.updatePosition`
- Синхронизация документов через operational transformation (OT)

Подробнее в документации Socket.IO интеграции.

---

## Troubleshooting

### Проблема: 403 Forbidden при POST запросах
**Решение**: Убедитесь, что отправляете правильный CSRF token в заголовке `X-CSRF-Token`.

### Проблема: 401 Unauthorized
**Решение**: 
- Для web endpoints: убедитесь, что cookies сессии отправляются с запросом
- Для private API: проверьте Basic Authentication credentials

### Проблема: 429 Too Many Requests
**Решение**: Уменьшите частоту запросов, подождите перед повторной попыткой.

### Проблема: Не могу создать пользователя через API
**Решение**: В Overleaf CE нет публичного API для создания пользователей по соображениям безопасности. Используйте:
1. Web интерфейс регистрации (если включен)
2. Программное создание через Node.js код
3. Прямое добавление в MongoDB (для dev окружения)

---

## Безопасность

⚠️ **Важные рекомендации**:

1. **Private API credentials**: Храните `httpAuthUsers` в безопасности, не публикуйте в репозитории
2. **HTTPS**: В production используйте HTTPS для всех API запросов
3. **CSRF Protection**: Всегда используйте CSRF token для мутирующих запросов
4. **Rate Limiting**: Учитывайте лимиты запросов, не создавайте DDoS нагрузку
5. **Validация**: Всегда валидируйте входные данные на стороне клиента
6. **Secrets**: Не храните пароли и токены в plaintext

---

## Поддержка

Для вопросов и проблем:
- GitHub Issues: https://github.com/overleaf/overleaf
- Community Edition Wiki: https://github.com/overleaf/overleaf/wiki

**Версия документации**: 1.0  
**Дата**: 2024-10-12  
**Overleaf CE Version**: Compatible with latest main branch

