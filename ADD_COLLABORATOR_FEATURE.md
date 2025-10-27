# Feature: Прямое добавление участников в проект

## Описание изменений

Добавлен новый API endpoint `/project/:Project_id/add`, который позволяет **напрямую добавлять существующих пользователей в проект** без процесса приглашения.

### Мотивация

Существующий endpoint `/project/:Project_id/invite` создает приглашение, которое:
- Отправляет email пользователю
- Требует от пользователя принять приглашение
- Создает дополнительный шаг в процессе

Новый endpoint `/project/:Project_id/add`:
- ✅ Сразу добавляет пользователя в проект
- ✅ Не требует принятия приглашения
- ✅ Не отправляет email уведомления
- ✅ Подходит для автоматизации и скриптов
- ❌ Требует чтобы пользователь был зарегистрирован в системе

## Изменённые файлы

### 1. Backend код

#### `services/web/app/src/Features/Collaborators/CollaboratorsController.mjs`

**Добавлено:**
- Импорты `UserGetter` и `EmailHelper`
- Функция `addUserDirectly` - основная логика endpoint
- Схема валидации `addUserDirectlySchema`
- Экспорт `addUserDirectly: expressify(addUserDirectly)`

**Функциональность:**
```javascript
async function addUserDirectly(req, res) {
  // 1. Валидация параметров
  // 2. Проверка лимитов коллабораторов
  // 3. Поиск пользователя по email
  // 4. Проверка что не участник
  // 5. Добавление через CollaboratorsHandler
  // 6. Audit log
  // 7. WebSocket уведомление
  // 8. Возврат результата
}
```

#### `services/web/app/src/Features/Collaborators/CollaboratorsRouter.mjs`

**Добавлено:**
- Новый маршрут `POST /project/:Project_id/add`
- Middleware: rate limiting, captcha, auth, authorization
- Привязка к `CollaboratorsController.addUserDirectly`

### 2. Документация

#### `api_doc/API_QUICK_REFERENCE.md`

**Изменено:**
- Добавлена строка в таблицу "Участники проекта"
- `/project/:Project_id/add` | POST | Добавить участника напрямую (без приглашения)

#### `api_doc/API_DOCUMENTATION_RU.md`

**Добавлено:**
- Новый раздел "Добавить участника напрямую (без приглашения)"
- Полное описание параметров запроса
- Примеры успешного ответа
- Описание всех возможных ошибок
- Сравнительная таблица `/add` vs `/invite`
- Обновлён пример в секции "Примеры использования"

#### `api_doc/ADD_COLLABORATOR_README.md` (новый файл)

**Содержание:**
- Подробное описание нового endpoint
- Сравнительная таблица с `/invite`
- Примеры использования (curl, Python)
- Описание ошибок
- Безопасность и ограничения
- Технические детали реализации
- Рекомендации когда использовать `/add` vs `/invite`

### 3. Примеры и тесты

#### `api_doc/test_add_collaborator.sh` (новый файл)

Bash скрипт для тестирования endpoint:
- ✅ Добавление существующего пользователя
- ✅ Проверка списка участников
- ✅ Попытка добавить несуществующего пользователя (ожидается ошибка)
- ✅ Попытка добавить дубликат (ожидается ошибка)
- ✅ Попытка добавить самого себя (ожидается ошибка)
- ✅ Добавление с ролью review

#### `api_doc/example_add_collaborator.py` (новый файл)

Python класс-обертка для работы с API:
- Класс `OverleafAPI` с методами:
  - `login()` - вход в систему
  - `create_project()` - создание проекта
  - `add_collaborator_directly()` - **новый метод**
  - `invite_collaborator()` - существующий метод для сравнения
  - `get_members()` - получение списка участников
- Демонстрационная функция `main()` с примерами использования

## API Спецификация

### Endpoint

```
POST /project/:Project_id/add
```

### Аутентификация

- Требуется login (cookies/session)
- Требуется CSRF token в заголовке `X-CSRF-Token`
- Требуется роль Admin в проекте

### Параметры запроса

```json
{
  "email": "user@example.com",
  "privileges": "readAndWrite",
  "isAnonymous": false
}
```

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `email` | string | Да | Email существующего пользователя |
| `privileges` | string | Да | `readAndWrite`, `readOnly`, или `review` |
| `isAnonymous` | boolean | Нет | Анонимный рецензент (default: false) |

### Успешный ответ (200 OK)

```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439022",
    "email": "user@example.com",
    "privileges": "readAndWrite"
  }
}
```

### Коды ошибок

| Код | Ошибка | Описание |
|-----|--------|----------|
| 400 | `cannot_add_self` | Попытка добавить самого себя |
| 400 | `invalid_email` | Некорректный формат email |
| 400 | `user_already_member` | Пользователь уже участник |
| 403 | `collaborator_limit_reached` | Достигнут лимит участников |
| 404 | `user_not_found` | Пользователь не найден |

## Rate Limiting

Используются те же rate limiters что и для `/invite`:
- `inviteToProjectByProjectId`: 100 запросов / 10 минут
- `inviteToProjectByIp`: 100 запросов / 10 минут

## Безопасность

### Middleware цепочка:

1. **RateLimiterMiddleware** - защита от flood
2. **CaptchaMiddleware** - защита от ботов
3. **AuthenticationController.requireLogin** - проверка авторизации
4. **AuthorizationMiddleware.ensureUserCanAdminProject** - проверка прав

### Audit Logging

Все действия логируются с типом `'add-collaborator-direct'`:
```javascript
ProjectAuditLogHandler.addEntryInBackground(
  projectId,
  'add-collaborator-direct',
  sendingUserId,
  req.ip,
  {
    userId: user._id,
    privileges: 'readAndWrite',
    isAnonymous: false
  }
)
```

## Использование

### Пример: Curl

```bash
# 1. Получить CSRF token
CSRF=$(curl -s http://localhost:3000/dev/csrf)

# 2. Войти
curl -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"user@example.com","password":"pass"}' \
  http://localhost:3000/login

# 3. Добавить участника
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"colleague@example.com","privileges":"readAndWrite"}' \
  http://localhost:3000/project/PROJECT_ID/add
```

### Пример: Python

```python
from example_add_collaborator import OverleafAPI

api = OverleafAPI()
api.login('user@example.com', 'password')

project = api.create_project('My Project')
result = api.add_collaborator_directly(
    project['project_id'],
    'colleague@example.com',
    'readAndWrite'
)

if result['data']['success']:
    print(f"Added: {result['data']['user']['email']}")
```

## Сравнение с существующим `/invite`

| Характеристика | `/add` (новый) | `/invite` (существующий) |
|----------------|----------------|--------------------------|
| Процесс | Мгновенное добавление | Приглашение → Принятие |
| Email | Не отправляется | Отправляется |
| Пользователь | Должен существовать | Может не существовать |
| Use case | Быстрое добавление коллег | Приглашение новых |
| Автоматизация | ✅ Отлично | ⚠️ Требует принятия |

## Тестирование

### Автоматическое тестирование

```bash
cd api_doc
./test_add_collaborator.sh
```

### Ручное тестирование

1. Убедитесь что Overleaf запущен: `http://localhost:3000`
2. Создайте тестовых пользователей:
   - `user1@example.com` (владелец)
   - `user2@example.com` (будет добавлен)
3. Запустите скрипт или используйте curl примеры

## Обратная совместимость

✅ **Полная обратная совместимость**
- Существующий endpoint `/invite` не изменён
- Новый endpoint `/add` - дополнительная функциональность
- Никаких breaking changes

## Миграция

Если вы используете `/invite` для добавления существующих пользователей:

```bash
# Старый способ (работает, но избыточен)
curl ... /project/$ID/invite -d '{"email":"user@ex.com",...}'
# → Создаёт приглашение, отправляет email, требует принятия

# Новый способ (быстрее)
curl ... /project/$ID/add -d '{"email":"user@ex.com",...}'
# → Сразу добавляет, если пользователь существует

# Стратегия: пробовать /add, при 404 использовать /invite
if ! curl ... /project/$ID/add ...; then
  curl ... /project/$ID/invite ...
fi
```

## Дополнительные материалы

- 📖 [ADD_COLLABORATOR_README.md](api_doc/ADD_COLLABORATOR_README.md) - подробная документация
- 📖 [API_DOCUMENTATION_RU.md](api_doc/API_DOCUMENTATION_RU.md) - полная API документация
- 📖 [API_QUICK_REFERENCE.md](api_doc/API_QUICK_REFERENCE.md) - краткий справочник
- 🧪 [test_add_collaborator.sh](api_doc/test_add_collaborator.sh) - тестовый скрипт
- 🐍 [example_add_collaborator.py](api_doc/example_add_collaborator.py) - Python пример

## Автор и дата

- **Добавлено:** 2025-10-19
- **Версия:** Overleaf CE (custom)
