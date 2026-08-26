# Overleaf CE API - Краткий справочник

## Аутентификация и сессии

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/login` | POST | Вход в систему |
| `/logout` | POST | Выход из системы |
| `/dev/csrf` | GET | Получить CSRF token |

## Пользователи

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/user/personal_info` | GET | Информация о текущем пользователе |
| `/user/settings` | POST | Обновить настройки пользователя |
| `/user/password/update` | POST | Изменить пароль |
| `/user/projects` | GET | Список проектов пользователя |

## Управление правами пользователей

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/user/:user_id/permissions` | GET | Получить права пользователя (admin) |
| `/api/user/:user_id/permissions` | POST | Установить права пользователя (admin) |

## Создание пользователей (Service API only)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/service/api/user/invite` | POST | Пригласить нового пользователя по e-mail, возвращает ссылку активации |
| `/service/api/user/create` | POST | Создать пользователя без письма и подтверждения (служебные/бот-аккаунты) |

## Проекты

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/user/projects` | GET | Список проектов пользователя |
| `/api/project` | POST | Получить список проектов (JSON) |
| `/project/new` | POST | Создать проект |
| `/project/:Project_id/entities` | GET | Список документов и файлов проекта (`id`, `path`, `type`) |
| `/project/:Project_id/rename` | POST | Переименовать проект |
| `/project/:Project_id/settings` | POST | Обновить настройки проекта |
| `/Project/:Project_id` | GET | Открыть проект в редакторе |
| `/Project/:Project_id/clone` | POST | Клонировать проект |
| `/Project/:Project_id/archive` | POST | Архивировать |
| `/Project/:Project_id/archive` | DELETE | Разархивировать |
| `/project/:project_id/trash` | POST | В корзину |
| `/project/:project_id/trash` | DELETE | Из корзины |
| `/Project/:Project_id` | DELETE | Удалить навсегда |
| `/Project/:Project_id/download/zip` | GET | Скачать ZIP |

## Файлы и документы

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:Project_id/upload` | POST | Загрузить файл (multipart/form-data) |
| `/project/:Project_id/doc` | POST | Создать новый документ |
| `/project/:Project_id/folder` | POST | Создать новую папку |
| `/project/:Project_id/:entity_type/:entity_id/rename` | POST | Переименовать файл/документ/папку |
| `/project/:Project_id/:entity_type/:entity_id/move` | POST | Переместить файл/документ/папку |
| `/project/:Project_id/file/:entity_id` | DELETE | Удалить файл |
| `/project/:Project_id/doc/:entity_id` | DELETE | Удалить документ |
| `/project/:Project_id/folder/:entity_id` | DELETE | Удалить папку |
| `/Project/:Project_id/file/:File_id` | GET | Скачать файл |
| `/Project/:Project_id/file/:File_id` | HEAD | Получить метаданные файла |
| `/Project/:Project_id/doc/:Doc_id/download` | GET | Скачать документ |
| `/project/:project_id/doc/:doc_id/metadata` | POST | Обновить метаданные документа |
| `/api/project/:Project_id/is-file-protected/:file_path` | GET | Проверить, защищён ли файл |

**Service API эндпоинты (только через `/service/` префикс):**

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/service/project/:Project_id/upload-by-path` | POST | Загрузить файл по пути (с сохранением истории) |
| `/service/project/:Project_id/sync-from-zip` | POST | Синхронизировать проект из ZIP (сохраняет историю и комментарии) |

**Примечание:** При использовании Service API (`/service/` префикс) можно изменять защищённые файлы.

## Защита проектов и файлов

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/project/:Project_id/protection` | GET | Получить статус защиты проекта |
| `/api/project/:Project_id/protection` | POST | Установить защиту проекта (owner) |
| `/api/project/:Project_id/protected-files` | GET | Список защищённых файлов |
| `/api/project/:Project_id/protected-files` | POST | Установить защищённые файлы (owner) |

## Участники проекта

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:Project_id/members` | GET | Список участников |
| `/project/:Project_id/invite` | POST | Пригласить участника |
| `/project/:Project_id/add` | POST | Добавить участника напрямую (без приглашения) |
| `/project/:Project_id/invites` | GET | Список приглашений |
| `/project/:Project_id/invite/:invite_id` | DELETE | Отозвать приглашение |
| `/project/:Project_id/users/:user_id` | PUT | Изменить роль |
| `/project/:Project_id/users/:user_id` | DELETE | Удалить участника |
| `/project/:Project_id/transfer-ownership` | POST | Передать владельца |
| `/project/:Project_id/leave` | POST | Покинуть проект |

## История проекта

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:project_id/latest/history` | GET | Получить последнюю версию истории |
| `/project/:project_id/changes` | GET | Получить список изменений |
| `/project/:project_id/version/:version/zip` | GET | Скачать ZIP определённой версии |
| `/project/:project_id/revert-project` | POST | Откатить проект к версии |
| `/project/:Project_id/flush` | POST | Сбросить историю в хранилище |
| `/project/:Project_id/labels` | GET | Получить метки (labels) |
| `/project/:Project_id/labels` | POST | Создать метку |
| `/project/:Project_id/labels/:label_id` | DELETE | Удалить метку |

## Компиляция

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:Project_id/compile` | POST | Запустить компиляцию |
| `/project/:Project_id/compile/stop` | POST | Остановить компиляцию |
| `/download/project/:Project_id/build/:build_id/output/output.pdf` | GET | Скачать PDF |
| `/project/:Project_id/build/:build_id/output/:filename` | GET | Скачать файл |
| `/project/:Project_id/wordcount` | GET | Подсчёт слов |

## Review Panel (комментарии и track changes)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/project/:Project_id/comments` | GET | Получить все комментарии с позициями (JSON API) |
| `/api/project/:Project_id/doc/:doc_id/comments` | POST | Добавить комментарий к фрагменту текста от имени пользователя |
| `/api/project/:Project_id/doc/:doc_id/suggestions` | POST | Добавить правки как track changes (с комментариями) от имени пользователя |
| `/api/project/:Project_id/users/:user_id/alias` | PUT | Задать/удалить псевдоним участника проекта (владелец) |
| `/project/:Project_id/ranges` | GET | Получить ranges (комментарии и изменения) |
| `/project/:Project_id/threads` | GET | Получить треды комментариев |
| `/project/:Project_id/changes/users` | GET | Получить пользователей, делавших изменения |
| `/project/:Project_id/thread/:thread_id/messages` | POST | Добавить сообщение в тред |
| `/project/:Project_id/doc/:Doc_id/thread/:thread_id` | DELETE | Удалить тред комментариев |
| `/project/:Project_id/doc/:Doc_id/thread/:thread_id/resolve` | POST | Отметить комментарий как решённый |
| `/project/:Project_id/doc/:Doc_id/thread/:thread_id/reopen` | POST | Открыть комментарий заново |
| `/project/:Project_id/thread/:thread_id/messages/:message_id/edit` | POST | Редактировать сообщение |
| `/project/:Project_id/thread/:thread_id/messages/:message_id` | DELETE | Удалить сообщение |
| `/project/:Project_id/track_changes` | POST | Включить/выключить track changes |
| `/project/:Project_id/doc/:doc_id/changes/accept` | POST | Принять изменения |

## Private API (требует Basic Auth)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/internal/project/:project_id` | GET | Детали проекта |
| `/project/:Project_id/doc/:doc_id` | GET | Получить документ |
| `/project/:Project_id/doc/:doc_id` | POST | Обновить документ |
| `/internal/project/:Project_id/zip` | GET | Скачать ZIP |
| `/internal/project/:project_id/compile/pdf` | GET | Компиляция + PDF |
| `/user/:user_id/personal_info` | GET | Информация о пользователе |

## Роли участников проекта

| Значение | Описание |
|----------|----------|
| `readAndWrite` | Редактор (полный доступ) |
| `readOnly` | Только чтение |
| `review` | Рецензент (комментарии + track changes) |
| `owner` | Владелец проекта |

## Уровни прав пользователя

| Значение | Описание |
|----------|----------|
| `full` | Полные права (по умолчанию) |
| `basic` | Ограниченные права: просмотр, редактирование, компиляция, но без создания/загрузки/копирования/удаления проектов |

## Коды ответов

| Код | Значение |
|-----|----------|
| 200 | Успех |
| 204 | Успех без содержимого |
| 400 | Неверный запрос |
| 401 | Требуется аутентификация |
| 403 | Доступ запрещён |
| 404 | Не найдено |
| 429 | Превышен лимит запросов |
| 500 | Внутренняя ошибка |

## Базовая структура запроса

### С сессией (cookies)
```bash
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"param":"value"}' \
  http://localhost:3000/endpoint
```

### Private API
```bash
curl -u username:password \
  http://localhost:3000/internal/endpoint
```

## Быстрый старт

```bash
# 1. Получить CSRF token
CSRF=$(curl -s http://localhost:3000/dev/csrf)

# 2. Войти
curl -c cookies.txt -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}' \
  http://localhost:3000/login

# 3. Создать проект
curl -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Test"}' \
  http://localhost:3000/project/new
```

## Rate Limits (запросов / период)

| Операция | Лимит |
|----------|-------|
| Создание проекта | 20 / минута |
| Компиляция | 800 / час |
| Login | 20 / минута (IP), 10 / 2 мин (email) |
| Приглашения | 10 × лимит коллабораторов / 30 мин |
| Открытие dashboard | 30 / минута |
| Открытие проекта | 15 / минута |

## Формат данных проекта

```json
{
  "project_id": "60a7b1234567890abcdef123",
  "name": "Project Name",
  "owner_ref": "507f1f77bcf86cd799439011",
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "accessLevel": "owner|readAndWrite|readOnly|review",
  "rootFolder": [{
    "docs": [{"_id": "doc_id", "name": "main.tex"}],
    "folders": [],
    "fileRefs": []
  }]
}
```

## Формат ответа компиляции

```json
{
  "status": "success|failure|error",
  "outputFiles": [
    {
      "path": "output.pdf",
      "build": "build_id",
      "url": "/path/to/file",
      "type": "pdf|log"
    }
  ],
  "buildId": "build_id"
}
```

---

📖 **Полная документация**: [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)

