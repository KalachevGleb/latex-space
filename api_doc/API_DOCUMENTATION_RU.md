# Документация по API Overleaf CE

## Оглавление
1. [Базовая информация](#базовая-информация)
2. [Аутентификация](#аутентификация)
3. [Управление пользователями](#управление-пользователями)
4. [Управление проектами](#управление-проектами)
5. [Файлы и документы](#файлы-и-документы)
6. [Управление участниками проекта](#управление-участниками-проекта)
7. [Защита проектов и файлов](#защита-проектов-и-файлов)
8. [Управление правами пользователей](#управление-правами-пользователей)
9. [История проекта](#история-проекта)
10. [Компиляция и скачивание](#компиляция-и-скачивание)
11. [Private API](#private-api)
12. [Review Panel (комментарии и track changes)](#review-panel-комментарии-и-track-changes)
13. [Review API (комментарии и правки от сервисов и ИИ)](#review-api-комментарии-и-правки-от-сервисов-и-ии)
14. [Примеры использования](#примеры-использования)

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

### Типы API

Overleaf предоставляет три типа API с разными методами аутентификации:

1. **Web API** - для браузерных приложений (требует сессию и CSRF)
2. **Service-to-Service API** - для интеграции с другими сервисами (Basic Auth)
3. **Private API** - для внутренних операций (Basic Auth)

### Web API - Вход (Login)
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

### Service-to-Service API аутентификация (NEW!)

Для интеграции с другими сервисами без браузерной сессии используйте Service API:

```http
GET /service/user/projects
Authorization: Basic <base64(username:password)>
X-Overleaf-User-Id: 507f1f77bcf86cd799439011
```

**Преимущества**:
- ✅ Не требуется управление сессией
- ✅ Не требуется CSRF токен
- ✅ Все Web API endpoints доступны через `/service/` префикс
- ✅ Идеально для backend-to-backend интеграции

**Пример**:
```bash
# Web API (требует сессию и CSRF)
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" \
  http://localhost:3000/user/projects

# Service API (только Basic Auth + user ID)
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  http://localhost:3000/service/user/projects
```

📖 **Подробная документация**: [SERVICE_TO_SERVICE_API.md](SERVICE_TO_SERVICE_API.md)

### Private API аутентификация

Private API endpoints требуют HTTP Basic Authentication:
```http
Authorization: Basic <base64(username:password)>
```

Учётные данные берутся из настроек `httpAuthUsers` в `settings.defaults.js`.

---

## Управление пользователями

### Пригласить нового пользователя (Service API)

```http
POST /service/api/user/invite
Authorization: Basic overleaf:<service_password>
Content-Type: application/json

{
  "email": "newuser@example.com"
}
```

Создаёт нового пользователя, генерирует токен активации (действует 7 дней) и отправляет письмо с ссылкой на указанный e-mail. В ответе возвращается та же ссылка.

**Ответ при успехе (201):**
```json
{
  "status": "created",
  "email": "newuser@example.com",
  "setNewPasswordUrl": "https://overleaf.example.com/user/activate?token=64e4...&user_id=507f1f77bcf86cd799439011"
}
```

**Коды ошибок:**

| Код | `error` | Причина |
|-----|---------|---------|
| 400 | `missing_email` | Email не передан |
| 400 | `invalid_email` | Неверный формат email |
| 403 | `forbidden` | Запрос без Service API аутентификации |
| 409 | `email_already_registered` | Пользователь с таким e-mail уже существует |
| 500 | — | Внутренняя ошибка |

**Пример (curl):**
```bash
curl -u overleaf:SERVICE_PASSWORD \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com"}' \
  http://localhost/service/api/user/invite
```

### Создать пользователя без письма (Service API)

Создаёт аккаунт сразу, без письма и без подтверждения e-mail. Предназначено для
служебных и бот-аккаунтов (например, ИИ-рецензента): e-mail не обязан быть
реальным, пароль не задаётся, поэтому войти в браузере таким аккаунтом нельзя —
он используется только через Service API (`X-Overleaf-User-Id` /
`X-Overleaf-User-Email`).

```http
POST /service/api/user/create
Authorization: Basic overleaf:<service_password>
Content-Type: application/json

{
  "email": "reviewer-bot@ai.local",
  "first_name": "ИИ",
  "last_name": "рецензент"
}
```

`first_name` и `last_name` необязательны (по умолчанию имя = часть e-mail до `@`).
Это глобальное имя пользователя; отображаемое имя внутри конкретного проекта
можно переопределить псевдонимом (см. «Задать псевдоним участника»).

**Ответ при успехе (201):**
```json
{
  "status": "created",
  "user_id": "6a8f5121a48c86a4e999addc",
  "email": "reviewer-bot@ai.local",
  "first_name": "ИИ",
  "last_name": "рецензент"
}
```

**Коды ошибок:**

| Код | `error` | Причина |
|-----|---------|---------|
| 400 | `missing_email` / `invalid_email` / `invalid_name` | Некорректное тело запроса |
| 403 | `forbidden` | Запрос без Service API аутентификации |
| 409 | `email_already_registered` | Пользователь уже есть; в ответе есть `user_id` |

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

### Получить список проектов (JSON API)
```http
POST /api/project
Content-Type: application/json

{
  "filters": ["owned", "shared"],
  "limit": 100
}
```

**Ответ:** Массив проектов с детальной информацией

### Обновить настройки проекта
```http
POST /project/:Project_id/settings
Content-Type: application/json

{
  "compiler": "pdflatex",
  "rootDoc_id": "doc_id",
  "spellCheckLanguage": "en"
}
```

**Параметры:**
- `compiler` - компилятор (pdflatex, xelatex, lualatex)
- `rootDoc_id` - ID главного документа
- `spellCheckLanguage` - язык проверки орфографии
- `imageName` - Docker образ для компиляции

**Ответ:** 204 No Content

### Открыть проект в редакторе
```http
GET /Project/:Project_id
```

**Ответ:** HTML страница редактора

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

## Файлы и документы

### Загрузить файл в проект
```http
POST /project/:Project_id/upload
Content-Type: multipart/form-data

Form data:
  - qqfile: содержимое файла (file)
  - name: имя файла (string)
  - relativePath: относительный путь для сохранения структуры папок (string, опционально)

Query params:
  - folder_id: ID папки для загрузки (опционально, по умолчанию корень)
```

**Пример:**
```bash
curl -X POST "http://localhost/project/$PROJECT_ID/upload?folder_id=$FOLDER_ID" \
  -F "qqfile=@document.pdf" \
  -F "name=document.pdf"
```

**Ответ:**
```json
{
  "success": true,
  "entity_id": "507f1f77bcf86cd799439011",
  "entity_type": "file",
  "hash": "abc123def456"
}
```

**Замечание:** Через Service API можно загружать файлы даже если они защищены.

### Загрузить файл по пути (Service API)

**Эндпоинт:** Доступен только через `/service/` префикс

```http
POST /service/project/:Project_id/upload-by-path
Content-Type: multipart/form-data

Form data:
  - qqfile: содержимое файла (file)
  - name: имя файла (string)
  - path: полный путь в проекте, например "/images/figure.png" (string)
```

**Особенности:**
- Автоматически создаёт папки, если их нет
- **Сохраняет историю** при замене существующих файлов (не удаляет и создаёт заново)
- **Сохраняет комментарии** для документов (.tex файлов)
- Работает с защищёнными файлами

**Пример:**
```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: $USER_ID" \
  -F "qqfile=@figure.png" \
  -F "name=figure.png" \
  -F "path=/images/figure.png" \
  "http://localhost/service/project/$PROJECT_ID/upload-by-path"
```

**Ответ:**
```json
{
  "success": true,
  "entity_id": "507f1f77bcf86cd799439011",
  "entity_type": "file",
  "hash": "abc123def456",
  "path": "/images/figure.png",
  "isNew": false
}
```

**Поле `isNew`:**
- `true` - файл был создан впервые
- `false` - файл был обновлён (история сохранена)

### Синхронизировать проект из ZIP (Service API)

**Эндпоинт:** Доступен только через `/service/` префикс

```http
POST /service/project/:Project_id/sync-from-zip
Content-Type: multipart/form-data

Form data:
  - qqfile: ZIP архив с файлами проекта (file)
```

**Операции:**
1. **Удаляет** файлы, которых нет в ZIP
2. **Обновляет** файлы, которые изменились (с сохранением истории)
3. **Добавляет** новые файлы из ZIP

**Особенности:**
- Автоматически определяет тип файлов (документы .tex или бинарные файлы)
- **Сохраняет историю изменений** для всех файлов
- **Сохраняет комментарии** в документах
- Автоматически создаёт структуру папок
- Работает с защищёнными файлами

**Пример:**
```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: $USER_ID" \
  -F "qqfile=@project.zip" \
  "http://localhost/service/project/$PROJECT_ID/sync-from-zip"
```

**Ответ:**
```json
{
  "success": true,
  "deleted": 2,
  "updated": 5,
  "added": 3
}
```

**Поля ответа:**
- `deleted` - количество удалённых файлов
- `updated` - количество обновлённых файлов (история сохранена)
- `added` - количество добавленных файлов

**Формат ZIP архива:**
- Может содержать папку верхнего уровня или файлы напрямую
- Структура папок в ZIP сохраняется в проекте
- Поддерживаются как документы (.tex, .bib, .sty), так и бинарные файлы (изображения, PDF)

### Создать новый документ
```http
POST /project/:Project_id/doc
Content-Type: application/json

{
  "name": "chapter1.tex",
  "parent_folder_id": "507f1f77bcf86cd799439011"  // опционально
}
```

**Ответ:**
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "name": "chapter1.tex"
}
```

### Создать новую папку
```http
POST /project/:Project_id/folder
Content-Type: application/json

{
  "name": "chapters",
  "parent_folder_id": "507f1f77bcf86cd799439011"  // опционально
}
```

**Ответ:**
```json
{
  "folder_id": "507f1f77bcf86cd799439013",
  "name": "chapters"
}
```

### Переименовать файл/документ/папку
```http
POST /project/:Project_id/:entity_type/:entity_id/rename
Content-Type: application/json

{
  "name": "new_name.tex"
}
```

**Параметры:**
- `entity_type` - тип сущности: `file`, `doc`, или `folder`
- `entity_id` - ID сущности

**Ответ:** 204 No Content

**Замечание:** Через Service API можно переименовывать защищенные файлы.

### Переместить файл/документ/папку
```http
POST /project/:Project_id/:entity_type/:entity_id/move
Content-Type: application/json

{
  "folder_id": "507f1f77bcf86cd799439014"
}
```

**Параметры:**
- `entity_type` - тип сущности: `file`, `doc`, или `folder`
- `entity_id` - ID сущности
- `folder_id` - ID целевой папки

**Ответ:** 204 No Content

### Удалить файл
```http
DELETE /project/:Project_id/file/:entity_id
```

**Ответ:** 204 No Content

**Замечание:** Через Service API можно удалять защищенные файлы.

### Удалить документ
```http
DELETE /project/:Project_id/doc/:entity_id
```

**Ответ:** 204 No Content

### Удалить папку
```http
DELETE /project/:Project_id/folder/:entity_id
```

**Ответ:** 204 No Content

### Скачать файл
```http
GET /Project/:Project_id/file/:File_id
```

**Ответ:** Содержимое файла (бинарные данные)

### Получить метаданные файла
```http
HEAD /Project/:Project_id/file/:File_id
```

**Ответ:** HTTP заголовки с информацией о файле (Content-Type, Content-Length)

### Скачать документ
```http
GET /Project/:Project_id/doc/:Doc_id/download
```

**Ответ:** Текстовое содержимое документа

### Обновить метаданные документа
```http
POST /project/:project_id/doc/:doc_id/metadata
Content-Type: application/json

{
  "metadata": {
    "labels": ["important"],
    "folderId": "folder_id"
  }
}
```

**Ответ:** 204 No Content

### Проверить, защищён ли файл
```http
GET /api/project/:Project_id/is-file-protected/:file_path
```

**Параметры:**
- `file_path` - путь к файлу (URL-encoded)

**Ответ:**
```json
{
  "isProtected": true
}
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

## Защита проектов и файлов

### Установить защиту проекта
```http
POST /api/project/:Project_id/protection
Content-Type: application/json

{
  "isProtected": true
}
```

**Параметры:**
- `isProtected` - `true` для защиты, `false` для снятия защиты

**Ответ:**
- `204 No Content` - успех
- `403 Forbidden` - недостаточно прав (требуется owner)
- `404 Not Found` - проект не найден

**Описание:** Защищённый проект нельзя удалить через UI или API. Защита может быть установлена только владельцем проекта.

### Получить статус защиты проекта
```http
GET /api/project/:Project_id/protection
```

**Ответ:**
```json
{
  "isProtected": true
}
```

### Установить список защищённых файлов
```http
POST /api/project/:Project_id/protected-files
Content-Type: application/json

{
  "protectedFiles": [
    "/source/template.sty",
    "/source/config.tex",
    "/images/logo.png"
  ]
}
```

**Параметры:**
- `protectedFiles` - массив путей к файлам (полные пути от корня проекта)

**Ответ:**
- `204 No Content` - успех

**Описание:** Защищённые файлы:
- Нельзя удалить
- Нельзя переименовать
- Нельзя изменить содержимое (только для чтения в редакторе)
- Отображаются с иконкой замка в файловом дереве
- Можно скрыть/показать через кнопку в тулбаре файлового дерева

**Формат путей:**
- Пути должны начинаться с `/`
- Примеры: `/main.tex`, `/chapters/intro.tex`, `/images/figure1.png`

### Получить список защищённых файлов
```http
GET /api/project/:Project_id/protected-files
```

**Ответ:**
```json
{
  "protectedFiles": [
    "/source/template.sty",
    "/source/config.tex"
  ]
}
```

### Снять защиту со всех файлов
```http
POST /api/project/:Project_id/protected-files
Content-Type: application/json

{
  "protectedFiles": []
}
```

---

## Управление правами пользователей

### Уровни прав пользователей
- `full` - Полные права (может создавать, загружать, копировать и удалять проекты)
- `basic` - Базовые права (может только работать с существующими проектами, не может создавать новые)

### Установить права пользователя
```http
POST /api/user/:user_id/permissions
Content-Type: application/json

{
  "permissions": "basic"
}
```

**Параметры:**
- `permissions` - `"full"` или `"basic"`

**Ответ:**
- `204 No Content` - успех
- `403 Forbidden` - недостаточно прав (требуется admin)
- `404 Not Found` - пользователь не найден

**Требования:**
- Доступно только администраторам системы
- Можно вызывать через admin UI на `/admin/users/list`

### Получить права пользователя
```http
GET /api/user/:user_id/permissions
```

**Ответ:**
```json
{
  "permissions": "full"
}
```

### Права пользователей по умолчанию

При создании нового пользователя:
- Если система в обычном режиме → права `full`
- Если включен режим peer-review → права `basic`

### Ограничения для пользователей с базовыми правами

Пользователи с `permissions: "basic"` **НЕ МОГУТ**:
- Создавать новые проекты
- Загружать проекты (upload)
- Копировать/клонировать проекты
- Удалять проекты (включая перемещение в корзину)

Пользователи с `permissions: "basic"` **МОГУТ**:
- Редактировать существующие проекты (если есть права collaborator)
- Компилировать проекты
- Скачивать PDF и файлы проектов
- Работать с комментариями и track changes
- Переименовывать файлы и папки внутри проектов

---

## История проекта

### Получить последнюю версию истории
```http
GET /project/:project_id/latest/history
```

**Ответ:** JSON с информацией о последних изменениях

### Получить список изменений
```http
GET /project/:project_id/changes
```

**Ответ:** Массив изменений с авторами и временными метками

### Скачать ZIP определённой версии
```http
GET /project/:project_id/version/:version/zip
```

**Параметры:**
- `version` - номер версии проекта

**Ответ:** ZIP архив проекта в указанной версии

### Откатить проект к версии
```http
POST /project/:project_id/revert-project
Content-Type: application/json

{
  "version": 42
}
```

**Параметры:**
- `version` - номер версии для отката

**Ответ:** 200 OK

### Сбросить историю в хранилище
```http
POST /project/:Project_id/flush
```

**Ответ:** 204 No Content

### Получить метки (labels)
```http
GET /project/:Project_id/labels
```

**Ответ:**
```json
[
  {
    "id": "label_id",
    "comment": "Версия для публикации",
    "version": 42,
    "created_at": "2024-01-15T10:30:00.000Z",
    "user_id": "user_id"
  }
]
```

### Создать метку
```http
POST /project/:Project_id/labels
Content-Type: application/json

{
  "comment": "Важная версия",
  "version": 42
}
```

**Ответ:** 200 OK с данными созданной метки

### Удалить метку
```http
DELETE /project/:Project_id/labels/:label_id
```

**Ответ:** 204 No Content

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

## Review Panel (комментарии и track changes)

### Получить все комментарии с позициями (JSON API)

Возвращает все комментарии проекта в структурированном формате с информацией о файлах, позициях и сообщениях.

```http
GET /api/project/:Project_id/comments
```

**Ответ:**
```json
{
  "comments": [
    {
      "thread_id": "507f1f77bcf86cd799439011",
      "file": "main.tex",
      "position": {
        "start": 145,
        "end": 178
      },
      "text": "выделенный текст комментария",
      "messages": [
        {
          "author": {
            "id": "60a7b1234567890abcdef123",
            "email": "user@example.com",
            "first_name": "Иван",
            "last_name": "Петров",
            "alias": "Рецензент 1"
          },
          "text": "Нужно исправить эту формулу",
          "timestamp": "2024-01-15T10:30:00.000Z"
        },
        {
          "author": {
            "id": "60a7b1234567890abcdef456",
            "email": "author@example.com",
            "first_name": "Мария",
            "last_name": "Иванова"
          },
          "text": "Спасибо, исправлю",
          "timestamp": "2024-01-15T11:00:00.000Z"
        }
      ],
      "resolved": false
    },
    {
      "thread_id": "507f1f77bcf86cd799439012",
      "file": "sections/introduction.tex",
      "position": {
        "start": 89,
        "end": 120
      },
      "text": "другой выделенный текст",
      "messages": [
        {
          "author": {
            "id": "60a7b1234567890abcdef123",
            "email": "user@example.com",
            "first_name": "Иван",
            "last_name": "Петров"
          },
          "text": "Отличное введение!",
          "timestamp": "2024-01-14T15:20:00.000Z"
        }
      ],
      "resolved": true
    }
  ]
}
```

**Структура ответа:**

- `comments` - массив всех комментариев проекта
  - `thread_id` - уникальный идентификатор треда комментариев
  - `file` - путь к файлу относительно корня проекта
  - `position` - позиция выделенного текста в файле
    - `start` - начальная позиция (количество символов от начала файла)
    - `end` - конечная позиция
  - `text` - выделенный текст, к которому относится комментарий
  - `messages` - массив сообщений в треде
    - `author` - информация об авторе сообщения
      - `id` - ID пользователя
      - `email` - email пользователя
      - `first_name` - имя
      - `last_name` - фамилия
      - `alias` - псевдоним (если установлен в настройках проекта)
    - `text` - текст сообщения
    - `timestamp` - время создания сообщения (ISO 8601)
  - `resolved` - статус комментария (решён или нет)

**Пример использования (bash):**

```bash
#!/bin/bash

# Получить CSRF token
CSRF_TOKEN=$(curl -s http://localhost:3000/dev/csrf)

# Войти в систему
curl -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user@example.com","password":"password123"}' \
  http://localhost:3000/login

# Получить комментарии проекта
PROJECT_ID="60a7b1234567890abcdef123"
curl -s -b cookies.txt \
  http://localhost:3000/api/project/$PROJECT_ID/comments | jq .
```

**Пример использования (Python):**

```python
import requests
import json

BASE_URL = 'http://localhost:3000'

# Создать сессию
session = requests.Session()

# Получить CSRF token
csrf_token = session.get(f'{BASE_URL}/dev/csrf').text

# Войти в систему
session.post(
    f'{BASE_URL}/login',
    json={'email': 'user@example.com', 'password': 'password123'},
    headers={'X-CSRF-Token': csrf_token}
)

# Получить комментарии
project_id = '60a7b1234567890abcdef123'
response = session.get(f'{BASE_URL}/api/project/{project_id}/comments')
comments_data = response.json()

# Вывести информацию о комментариях
for comment in comments_data['comments']:
    print(f"Файл: {comment['file']}")
    print(f"Позиция: {comment['position']['start']}-{comment['position']['end']}")
    print(f"Текст: {comment['text']}")
    print(f"Сообщений: {len(comment['messages'])}")
    print(f"Решён: {comment['resolved']}")
    print("---")
```

**Примечания:**

- Комментарии возвращаются только для документов, которые имеют активные комментарии
- Позиции указаны в символах от начала файла (включая переводы строк)
- Если у автора сообщения установлен псевдоним в настройках проекта, он будет включён в поле `alias`
- Удалённые комментарии не возвращаются
- Endpoint требует прав на чтение проекта

### Получить ranges (комментарии и изменения)

Возвращает информацию о комментариях и tracked changes для всех документов проекта.

```http
GET /project/:Project_id/ranges
```

**Ответ:**
```json
[
  {
    "id": "doc_id",
    "ranges": {
      "comments": [
        {
          "id": "thread_id",
          "op": {
            "c": "выделенный текст",
            "p": 145,
            "t": "thread_id"
          },
          "resolved": false
        }
      ],
      "changes": [
        {
          "id": "change_id",
          "op": {
            "i": "вставленный текст",
            "p": 100
          },
          "metadata": {
            "user_id": "user_id",
            "ts": "2024-01-15T10:30:00.000Z"
          }
        }
      ]
    }
  }
]
```

### Получить треды комментариев

Возвращает все треды комментариев с сообщениями и информацией об авторах.

```http
GET /project/:Project_id/threads
```

**Ответ:**
```json
{
  "thread_id": {
    "id": "thread_id",
    "messages": [
      {
        "id": "message_id",
        "content": "Текст комментария",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "user": {
          "id": "user_id",
          "email": "user@example.com",
          "first_name": "Иван",
          "last_name": "Петров"
        }
      }
    ],
    "resolved": false
  }
}
```

### Получить пользователей, делавших изменения

Возвращает список пользователей, которые делали изменения в проекте.

```http
GET /project/:Project_id/changes/users
```

**Ответ:**
```json
[
  {
    "id": "user_id",
    "email": "user@example.com",
    "first_name": "Иван",
    "last_name": "Петров",
    "alias": "Рецензент 1"
  }
]
```

### Добавить сообщение в тред

```http
POST /project/:Project_id/thread/:thread_id/messages
Content-Type: application/json

{
  "content": "Текст сообщения"
}
```

**Ответ:** 200 OK с данными созданного сообщения

### Удалить тред комментариев

```http
DELETE /project/:Project_id/doc/:Doc_id/thread/:thread_id
```

**Ответ:** 204 No Content

### Отметить комментарий как решённый

```http
POST /project/:Project_id/doc/:Doc_id/thread/:thread_id/resolve
```

**Ответ:** 204 No Content

### Открыть комментарий заново

```http
POST /project/:Project_id/doc/:Doc_id/thread/:thread_id/reopen
```

**Ответ:** 204 No Content

### Редактировать сообщение

```http
POST /project/:Project_id/thread/:thread_id/messages/:message_id/edit
Content-Type: application/json

{
  "content": "Обновлённый текст"
}
```

**Ответ:** 204 No Content

### Удалить сообщение

```http
DELETE /project/:Project_id/thread/:thread_id/messages/:message_id
```

**Ответ:** 204 No Content

### Включить/выключить track changes

```http
POST /project/:Project_id/track_changes
Content-Type: application/json

{
  "on": true
}
```

**Параметры:**
- `on` (boolean) - `true` для включения, `false` для выключения

**Ответ:** 204 No Content

### Принять изменения

```http
POST /project/:Project_id/doc/:doc_id/changes/accept
Content-Type: application/json

{
  "change_ids": ["change_id_1", "change_id_2"]
}
```

**Параметры:**
- `change_ids` (array) - массив ID изменений для принятия

**Ответ:** 204 No Content

---

## Review API (комментарии и правки от сервисов и ИИ)

Эти endpoints позволяют внешнему сервису (например, ИИ-рецензенту) добавлять в
документ комментарии и правки, которые в редакторе выглядят точно так же, как
сделанные человеком: правки отображаются в track changes (их можно принять или
отклонить), комментарии — в панели рецензирования.

**Как устроено авторство.** Никаких отдельных сущностей «ИИ-автор» нет. Автор —
обычный пользователь, указанный в `X-Overleaf-User-Id` (обычно бот-аккаунт,
созданный через `POST /service/api/user/create`), который должен быть участником
проекта — рекомендуется роль `review` (`POST /service/project/:id/add` с
`"privileges": "review"`): такой участник может только комментировать и вносить
tracked changes. Отображаемое имя задаётся на уровне проекта псевдонимом
(`memberAliases`) — так один и тот же бот в одном проекте может называться
«ИИ рецензия», в другом «ИИ корректура». Псевдоним действует на все комментарии
и правки этого пользователя в проекте. Если нужно несколько «персон»
одновременно в одном проекте — создайте несколько бот-пользователей.

**Позиции.** `pos` — смещение в символах от начала документа (строки соединены
`\n`), в той же системе координат, что и `position.start` в
`GET /api/project/:id/comments`. Текст документа и его версию можно получить
через `GET /service/Project/:id/doc/:doc_id/download`. Чтобы исключить ошибки,
сервер всегда сверяет `text` / `old_text` с реальным содержимым документа по
указанной позиции и при расхождении отвечает `409 text_mismatch` (в ответе есть
`expected` и `actual`). Параллельные правки других пользователей не ломают
результат: операции проходят через штатный OT-конвейер document-updater.

### Добавить комментарий к фрагменту текста

```http
POST /service/api/project/:Project_id/doc/:doc_id/comments
Authorization: Basic overleaf:<service_password>
X-Overleaf-User-Id: <bot_user_id>
Content-Type: application/json

{
  "pos": 99,
  "text": "cellular automata",
  "content": "Уточните, о каком классе клеточных автоматов идёт речь.",
  "author_alias": "ИИ рецензия"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `pos` | number | Смещение начала фрагмента |
| `text` | string | Текст фрагмента, к которому привязывается комментарий (сверяется с документом) |
| `content` | string | Текст комментария (поддерживается Markdown/MathJax как в обычных комментариях) |
| `author_alias` | string, опц. | Задать псевдоним автора в этом проекте; `null` или `""` — убрать |

**Ответ (201):**
```json
{
  "thread_id": "6a8f5121d412da6d47000001",
  "doc_id": "6a8f5121a48c86a4e999ade4",
  "position": { "start": 99, "end": 116 },
  "text": "cellular automata",
  "message": {
    "id": "6a8f5121a48c86a4e999adec",
    "content": "Уточните, ...",
    "timestamp": "2026-08-26T20:48:01.000Z",
    "user": { "id": "...", "email": "...", "first_name": "TestBot", "last_name": "", "alias": "ИИ рецензия" }
  }
}
```

Права: пользователь должен иметь право писать или рецензировать проект
(владелец, `readAndWrite` или `review`).

### Добавить правки как track changes

Каждый элемент `items` — замена фрагмента `old_text` на `new_text` начиная с
`pos`. Сервер строит пословный diff (`diff`), так что в track changes видны
только реально изменённые слова, и применяет все замены одним обновлением от
имени пользователя. К любой замене можно приложить комментарий — он привязывается
к новому тексту (для чистого удаления, когда `new_text` пустой, — к символу
сразу после удалённого фрагмента).

```http
POST /service/api/project/:Project_id/doc/:doc_id/suggestions
Authorization: Basic overleaf:<service_password>
X-Overleaf-User-Id: <bot_user_id>
Content-Type: application/json

{
  "author_alias": "ИИ корректура",
  "items": [
    { "pos": 75,  "old_text": "studys",    "new_text": "studies", "comment": "Опечатка." },
    { "pos": 87,  "old_text": "behaviour", "new_text": "behavior" },
    { "pos": 150, "old_text": "that that", "new_text": "that",    "comment": "Повтор слова." },
    { "pos": 238, "old_text": ", and experiments", "new_text": "", "comment": "Лишнее упоминание." }
  ]
}
```

Требования к `items`: не более 500 элементов, позиции указываются относительно
**текущего** документа (до применения правок), фрагменты не должны
пересекаться, `old_text` ≠ `new_text`.

**Ответ (200):**
```json
{
  "version": 3,
  "applied": 4,
  "comments": [
    { "index": 0, "thread_id": "6a8f5121b727ab66f1000001" },
    { "index": 2, "thread_id": "6a8f51213d9ee5116e000001" },
    { "index": 3, "thread_id": "6a8f512162518c0945000001" }
  ]
}
```

Правки видны в панели track changes как изменения от указанного пользователя
(с его псевдонимом); их можно принять/отклонить как обычные, в том числе через
`POST /project/:id/doc/:doc_id/changes/accept`. Включать режим track changes
в проекте для этого не требуется.

**Коды ошибок (оба endpoint):**

| Код | `error` | Причина |
|-----|---------|---------|
| 400 | `invalid_pos`, `invalid_text`, `invalid_content`, `invalid_items`, `too_many_items`, `no_change`, `overlapping_items`, `invalid_comment`, `invalid_alias` | Некорректное тело запроса; для `items` в ответе есть `index` |
| 404 | `not_found` | Документ не найден |
| 409 | `text_mismatch` | Текст по позиции не совпадает; в ответе `expected`, `actual` (и `index`) |
| 409 | `ops_rejected` | document-updater отверг операции (документ изменился между чтением и записью) — перечитайте документ и повторите |

### Задать псевдоним участника

```http
PUT /service/api/project/:Project_id/users/:user_id/alias
Authorization: Basic overleaf:<service_password>
X-Overleaf-User-Id: <owner_or_admin_user_id>
Content-Type: application/json

{ "alias": "ИИ корректура" }
```

`null` или пустая строка убирают псевдоним. Требуются права администратора
проекта (владелец). Тот же эффект для *своего* псевдонима даёт поле
`author_alias` в запросах выше — оно не требует прав владельца. Псевдоним
хранится в поле `memberAliases` проекта и используется везде, где показывается
имя автора: комментарии, track changes, список участников. Открытые редакторы
обновляют имя сразу (событие `project:membership:changed`).

**Ответ (200):** `{ "user_id": "...", "alias": "ИИ корректура" }`; `404 not_a_member`, если пользователь не участник проекта.

### Сценарий: ИИ-рецензент

```bash
BASE=http://localhost; AUTH="-u overleaf:$SERVICE_PASSWORD"

# 1. Один раз: создать бот-аккаунт
BOT=$(curl -s $AUTH -H 'Content-Type: application/json' \
  -d '{"email":"reviewer-bot@ai.local","first_name":"ИИ"}' \
  $BASE/service/api/user/create | jq -r .user_id)

# 2. Для каждого проекта: добавить бота как рецензента (от имени владельца)
curl -s $AUTH -H "X-Overleaf-User-Id: $OWNER_ID" -H 'Content-Type: application/json' \
  -d '{"email":"reviewer-bot@ai.local","privileges":"review"}' \
  $BASE/service/project/$PROJECT_ID/add

# 3. Прочитать документ (позиции считаются по этому тексту)
curl -s $AUTH -H "X-Overleaf-User-Id: $BOT" \
  $BASE/service/Project/$PROJECT_ID/doc/$DOC_ID/download > main.tex

# 4. Отправить комментарии и правки от имени бота
curl -s $AUTH -H "X-Overleaf-User-Id: $BOT" -H 'Content-Type: application/json' \
  -d '{"author_alias":"ИИ рецензия","items":[{"pos":75,"old_text":"studys","new_text":"studies","comment":"Опечатка."}]}' \
  $BASE/service/api/project/$PROJECT_ID/doc/$DOC_ID/suggestions
```

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

### Пример 5: Защита проекта и установка защищённых файлов

```bash
#!/bin/bash

# Предполагается, что сессия активна
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3000/dev/csrf)
PROJECT_ID="68f66d808f3d24862ffcc607"

# Защитить проект от удаления
curl -s -b cookies.txt \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"isProtected": true}' \
  http://localhost:3000/api/project/$PROJECT_ID/protection

echo "Project protected"

# Установить список защищённых файлов
curl -s -b cookies.txt \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "protectedFiles": [
      "/source/template.sty",
      "/source/config.tex",
      "/source/header.tex"
    ]
  }' \
  http://localhost:3000/api/project/$PROJECT_ID/protected-files

echo "Protected files set"

# Проверить статус защиты
curl -s -b cookies.txt \
  http://localhost:3000/api/project/$PROJECT_ID/protection

# Получить список защищённых файлов
curl -s -b cookies.txt \
  http://localhost:3000/api/project/$PROJECT_ID/protected-files
```

### Пример 6: Управление правами пользователей (admin)

```python
import requests

BASE_URL = 'http://localhost:3000'

class OverleafAdminAPI:
    def __init__(self, admin_email, admin_password):
        self.session = requests.Session()
        self.csrf_token = None
        self.login(admin_email, admin_password)

    def login(self, email, password):
        # Получить CSRF token
        response = self.session.get(f'{BASE_URL}/dev/csrf')
        self.csrf_token = response.text.strip()

        # Войти
        response = self.session.post(
            f'{BASE_URL}/login',
            json={'email': email, 'password': password},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()

    def set_user_permissions(self, user_id, permissions):
        """
        Установить права пользователя
        permissions: 'full' или 'basic'
        """
        response = self.session.post(
            f'{BASE_URL}/api/user/{user_id}/permissions',
            json={'permissions': permissions},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.status_code == 204

    def get_user_permissions(self, user_id):
        """Получить текущие права пользователя"""
        response = self.session.get(
            f'{BASE_URL}/api/user/{user_id}/permissions',
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.json()

    def protect_project(self, project_id, is_protected=True):
        """Защитить/разprotected проект"""
        response = self.session.post(
            f'{BASE_URL}/api/project/{project_id}/protection',
            json={'isProtected': is_protected},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.status_code == 204

    def set_protected_files(self, project_id, file_paths):
        """
        Установить список защищённых файлов
        file_paths: список путей, например ['/main.tex', '/config.sty']
        """
        response = self.session.post(
            f'{BASE_URL}/api/project/{project_id}/protected-files',
            json={'protectedFiles': file_paths},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return response.status_code == 204

# Использование
admin = OverleafAdminAPI('admin@example.com', 'admin_password')

# Установить базовые права пользователю
user_id = '68eeb449ee75875128fa170f'
admin.set_user_permissions(user_id, 'basic')
print(f'Set basic permissions for user {user_id}')

# Проверить права
perms = admin.get_user_permissions(user_id)
print(f'Current permissions: {perms["permissions"]}')

# Защитить проект
project_id = '68f66d808f3d24862ffcc607'
admin.protect_project(project_id, True)
print(f'Protected project {project_id}')

# Установить защищённые файлы
protected_files = [
    '/source/template.sty',
    '/source/config.tex',
    '/images/logo.png'
]
admin.set_protected_files(project_id, protected_files)
print(f'Set {len(protected_files)} protected files')

# Вернуть полные права пользователю
admin.set_user_permissions(user_id, 'full')
print(f'Restored full permissions for user {user_id}')
```

### Пример 7: Комбинированный сценарий - создание шаблона проекта

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

class OverleafTemplateManager {
  constructor(email, password) {
    this.session = axios.create({
      baseURL: BASE_URL,
      withCredentials: true
    });
    this.csrfToken = null;
  }

  async login(email, password) {
    // Получить CSRF token
    const csrfResponse = await this.session.get('/dev/csrf');
    this.csrfToken = csrfResponse.data.trim();

    // Войти
    await this.session.post('/login',
      { email, password },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );
  }

  async createTemplateProject(name) {
    // Создать проект
    const projectResponse = await this.session.post('/project/new',
      { projectName: name },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );

    const projectId = projectResponse.data.project_id;

    // Защитить проект
    await this.session.post(`/api/project/${projectId}/protection`,
      { isProtected: true },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );

    // Установить защищённые файлы (например, стилевые файлы шаблона)
    await this.session.post(`/api/project/${projectId}/protected-files`,
      {
        protectedFiles: [
          '/template.sty',
          '/settings.tex',
          '/bibliography.bib'
        ]
      },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );

    return projectId;
  }

  async shareTemplateWithUsers(projectId, userEmails) {
    // Добавить пользователей как readAndWrite (могут использовать шаблон)
    for (const email of userEmails) {
      try {
        await this.session.post(`/project/${projectId}/add`,
          { email, privileges: 'readAndWrite' },
          { headers: { 'X-CSRF-Token': this.csrfToken } }
        );
        console.log(`Added ${email} to template project`);
      } catch (error) {
        console.error(`Failed to add ${email}:`, error.response?.data);
      }
    }
  }
}

// Использование
(async () => {
  const manager = new OverleafTemplateManager();
  await manager.login('admin@example.com', 'password');

  // Создать защищённый шаблон
  const templateId = await manager.createTemplateProject('Company LaTeX Template');
  console.log(`Created template project: ${templateId}`);

  // Поделиться с пользователями
  await manager.shareTemplateWithUsers(templateId, [
    'user1@example.com',
    'user2@example.com',
    'user3@example.com'
  ]);

  console.log('Template project created and shared!');
})();
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

