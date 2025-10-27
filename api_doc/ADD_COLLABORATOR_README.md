# API Endpoint: Прямое добавление участников

## Обзор

Новый API endpoint `/project/:Project_id/add` позволяет добавлять существующих пользователей в проект **напрямую**, минуя процесс приглашения.

## Отличия от `/invite`

| Характеристика | `/project/:Project_id/add` (новый) | `/project/:Project_id/invite` (существующий) |
|----------------|-----------------------------------|---------------------------------------------|
| **Процесс** | Сразу добавляет пользователя | Создает приглашение, требует принятия |
| **Email уведомление** | Нет | Да, отправляется письмо |
| **Требования к пользователю** | Должен быть зарегистрирован | Может быть незарегистрирован |
| **Мгновенный доступ** | Да | Нет, после принятия приглашения |
| **Use case** | Быстрое добавление коллег | Приглашение новых пользователей |

## Использование

### Базовый пример (curl)

```bash
# Получить CSRF токен
CSRF_TOKEN=$(curl -s http://localhost:3000/dev/csrf)

# Войти
curl -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user@example.com","password":"password"}' \
  http://localhost:3000/login

# Добавить участника напрямую
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"colleague@example.com","privileges":"readAndWrite"}' \
  http://localhost:3000/project/PROJECT_ID/add
```

### Параметры запроса

```json
{
  "email": "user@example.com",          // Email существующего пользователя (обязательно)
  "privileges": "readAndWrite",         // Уровень доступа (обязательно)
  "isAnonymous": false                  // Анонимный рецензент (опционально)
}
```

**Допустимые значения `privileges`:**
- `readAndWrite` - Редактор (полный доступ к редактированию)
- `readOnly` - Только чтение
- `review` - Рецензент (комментарии + track changes)

### Успешный ответ (200 OK)

```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439022",
    "email": "colleague@example.com",
    "privileges": "readAndWrite"
  }
}
```

### Возможные ошибки

| Код | Ошибка | Описание |
|-----|--------|----------|
| 400 | `cannot_add_self` | Попытка добавить самого себя |
| 400 | `invalid_email` | Некорректный формат email |
| 400 | `user_already_member` | Пользователь уже является участником |
| 403 | `collaborator_limit_reached` | Достигнут лимит участников проекта |
| 404 | `user_not_found` | Пользователь с таким email не найден в системе |

Пример ответа с ошибкой:
```json
{
  "error": "user_not_found"
}
```

## Примеры кода

### Bash скрипт

См. файл [`test_add_collaborator.sh`](./test_add_collaborator.sh) - полный тестовый скрипт с проверкой всех случаев.

Запуск:
```bash
./test_add_collaborator.sh
```

### Python

См. файл [`example_add_collaborator.py`](./example_add_collaborator.py) - класс-обертка для работы с API.

Запуск:
```bash
python3 example_add_collaborator.py
```

Использование в коде:
```python
from example_add_collaborator import OverleafAPI

api = OverleafAPI()
api.login('user@example.com', 'password')

# Создать проект
project = api.create_project('My Project')
project_id = project['project_id']

# Добавить участника напрямую
result = api.add_collaborator_directly(
    project_id,
    'colleague@example.com',
    'readAndWrite'
)

if result['data'].get('success'):
    print(f"Добавлен: {result['data']['user']['email']}")
```

## Безопасность и ограничения

### Аутентификация
- Требуется авторизация (cookies или session)
- Требуется CSRF токен в заголовке

### Права доступа
- Только владелец проекта или администраторы могут добавлять участников
- Проверяется через `AuthorizationMiddleware.ensureUserCanAdminProject`

### Rate Limiting
Используются те же ограничения, что и для `/invite`:
- 100 запросов на 10 минут по ID проекта
- 100 запросов на 10 минут по IP адресу

### Captcha
Требуется валидация captcha (настраивается в конфигурации)

## Технические детали

### Маршрут

Файл: `services/web/app/src/Features/Collaborators/CollaboratorsRouter.mjs`

```javascript
webRouter.post(
  '/project/:Project_id/add',
  RateLimiterMiddleware.rateLimit(rateLimiters.inviteToProjectByProjectId),
  RateLimiterMiddleware.rateLimit(rateLimiters.inviteToProjectByIp),
  CaptchaMiddleware.validateCaptcha('invite'),
  AuthenticationController.requireLogin(),
  AuthorizationMiddleware.ensureUserCanAdminProject,
  CollaboratorsController.addUserDirectly
)
```

### Контроллер

Файл: `services/web/app/src/Features/Collaborators/CollaboratorsController.mjs`

Функция `addUserDirectly`:
1. Валидирует параметры (email, privileges)
2. Проверяет лимиты коллабораторов
3. Находит пользователя по email
4. Проверяет, что пользователь еще не участник
5. Добавляет пользователя через `CollaboratorsHandler.addUserIdToProject`
6. Логирует действие в аудит-лог
7. Уведомляет других пользователей через WebSocket

### Audit Log

Все добавления логируются с типом `'add-collaborator-direct'`:
```javascript
{
  action: 'add-collaborator-direct',
  userId: user._id,
  privileges: 'readAndWrite',
  isAnonymous: false
}
```

## Когда использовать `/add` vs `/invite`

### Используйте `/add` когда:
- ✅ Вы знаете, что пользователь уже зарегистрирован
- ✅ Нужен мгновенный доступ к проекту
- ✅ Не нужны email уведомления
- ✅ Массовое добавление пользователей по списку
- ✅ Автоматизация через скрипты

### Используйте `/invite` когда:
- ✅ Пользователь может быть не зарегистрирован
- ✅ Нужно отправить приглашение по email
- ✅ Пользователь должен сам принять приглашение
- ✅ Стандартный workflow приглашения

## Миграция с `/invite` на `/add`

Если вы использовали `/invite` для добавления существующих пользователей:

**Было:**
```bash
curl -X POST .../project/$PROJECT_ID/invite \
  -d '{"email":"user@example.com","privileges":"readAndWrite"}'
# Пользователь получает email, должен принять приглашение
```

**Стало:**
```bash
curl -X POST .../project/$PROJECT_ID/add \
  -d '{"email":"user@example.com","privileges":"readAndWrite"}'
# Пользователь сразу добавлен, без email
```

**Обработка ошибок:**
```bash
# Проверить существование пользователя перед добавлением
RESPONSE=$(curl -X POST .../project/$PROJECT_ID/add -d '...')

if echo $RESPONSE | grep -q "user_not_found"; then
  # Пользователь не найден - использовать /invite
  curl -X POST .../project/$PROJECT_ID/invite -d '...'
fi
```

## Дополнительная документация

- [API_DOCUMENTATION_RU.md](./API_DOCUMENTATION_RU.md) - Полная документация API
- [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md) - Краткий справочник
