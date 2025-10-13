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

## Проекты

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/new` | POST | Создать проект |
| `/project/:Project_id/rename` | POST | Переименовать проект |
| `/project/:Project_id/entities` | GET | Структура проекта |
| `/Project/:Project_id/clone` | POST | Клонировать проект |
| `/Project/:Project_id/archive` | POST | Архивировать |
| `/Project/:Project_id/archive` | DELETE | Разархивировать |
| `/project/:project_id/trash` | POST | В корзину |
| `/project/:project_id/trash` | DELETE | Из корзины |
| `/Project/:Project_id` | DELETE | Удалить навсегда |
| `/Project/:Project_id/download/zip` | GET | Скачать ZIP |

## Участники проекта

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:Project_id/members` | GET | Список участников |
| `/project/:Project_id/invite` | POST | Пригласить участника |
| `/project/:Project_id/invites` | GET | Список приглашений |
| `/project/:Project_id/invite/:invite_id` | DELETE | Отозвать приглашение |
| `/project/:Project_id/users/:user_id` | PUT | Изменить роль |
| `/project/:Project_id/users/:user_id` | DELETE | Удалить участника |
| `/project/:Project_id/transfer-ownership` | POST | Передать владельца |
| `/project/:Project_id/leave` | POST | Покинуть проект |

## Компиляция

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/project/:Project_id/compile` | POST | Запустить компиляцию |
| `/project/:Project_id/compile/stop` | POST | Остановить компиляцию |
| `/download/project/:Project_id/build/:build_id/output/output.pdf` | GET | Скачать PDF |
| `/project/:Project_id/build/:build_id/output/:filename` | GET | Скачать файл |
| `/project/:Project_id/wordcount` | GET | Подсчёт слов |

## Private API (требует Basic Auth)

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/internal/project/:project_id` | GET | Детали проекта |
| `/project/:Project_id/doc/:doc_id` | GET | Получить документ |
| `/project/:Project_id/doc/:doc_id` | POST | Обновить документ |
| `/internal/project/:Project_id/zip` | GET | Скачать ZIP |
| `/internal/project/:project_id/compile/pdf` | GET | Компиляция + PDF |
| `/user/:user_id/personal_info` | GET | Информация о пользователе |

## Роли участников

| Значение | Описание |
|----------|----------|
| `readAndWrite` | Редактор (полный доступ) |
| `readOnly` | Только чтение |
| `review` | Рецензент (комментарии + track changes) |
| `owner` | Владелец проекта |

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

