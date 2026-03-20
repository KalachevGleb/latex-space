# Service-to-Service API - Быстрый старт

## Что это?

Service API позволяет вызывать все Web API endpoints из другого сервиса без браузерной сессии и CSRF токенов.

**Важно:** Операции выполняются от имени администратора с указанием пользователя через заголовок.

## Быстрый пример

### До (Web API с сессией)

```bash
# 1. Получить CSRF token
CSRF=$(curl -s http://localhost/dev/csrf)

# 2. Войти в систему
curl -c cookies.txt -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  http://localhost/login

# 3. Создать проект
curl -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Test"}' \
  http://localhost/project/new
```

### После (Service API)

```bash
# Создать проект одним запросом
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Test"}' \
  http://localhost/service/project/new
```

## Ключевые отличия

| Web API | Service API |
|---------|-------------|
| `/project/new` | `/service/project/new` |
| Cookie сессия | HTTP Basic Auth |
| Требуется CSRF токен | Не требуется |
| Контекст из сессии | Заголовок `X-Overleaf-User-Id` |

## Настройка

### 1. Включение Service API

**Через админ-панель:**
1. Войдите как администратор
2. Перейдите в **Admin → Service API Settings**
3. Включите Service API и установите пароль
4. Опционально: ограничьте доступ только с localhost

**Через переменные окружения (при установке):**
```bash
export SERVICE_API_ENABLED=true
export SERVICE_API_PASSWORD="secure-password"
export SERVICE_API_LOCALHOST_ONLY=true  # опционально
```

### 2. Получить User ID

```bash
# Через Private API
curl -u overleaf:password \
  http://localhost/user/507f1f77bcf86cd799439011/personal_info

# Или используйте email вместо ID
curl -u overleaf:password \
  -H "X-Overleaf-User-Email: user@example.com" \
  http://localhost/service/user/projects
```

## Примеры использования

### Список проектов пользователя

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  http://localhost/service/user/projects
```

### Создать проект

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"New Project"}' \
  http://localhost/service/project/new
```

### Компилировать проект

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"incrementalCompilesEnabled":true}' \
  http://localhost/service/project/$PROJECT_ID/compile
```

### Получить комментарии

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  http://localhost/service/api/project/$PROJECT_ID/comments
```

### Добавить участника

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"email":"colleague@example.com","privileges":"readAndWrite"}' \
  http://localhost/service/project/$PROJECT_ID/add
```

## Python клиент

```python
import requests

class OverleafServiceAPI:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.auth = (username, password)
    
    def create_project(self, user_id, name):
        response = requests.post(
            f'{self.base_url}/service/project/new',
            json={'projectName': name},
            auth=self.auth,
            headers={'X-Overleaf-User-Id': user_id}
        )
        return response.json()

# Использование
api = OverleafServiceAPI('http://localhost', 'overleaf', 'password')
project = api.create_project('507f1f77bcf86cd799439011', 'Test Project')
print(f"Created: {project['project_id']}")
```

## Доступные endpoints

**Все Web API endpoints доступны через `/service/` префикс:**

- `/service/user/projects` - список проектов
- `/service/project/new` - создать проект
- `/service/project/:id/compile` - компилировать
- `/service/project/:id/members` - участники
- `/service/api/project/:id/comments` - комментарии
- `/service/api/project/:id/protection` - защита проекта
- И все остальные Web API endpoints...

## Полная документация

📖 **[api_doc/SERVICE_TO_SERVICE_API.md](api_doc/SERVICE_TO_SERVICE_API.md)** - Полная документация с примерами на Python, Node.js, Bash

📖 **[api_doc/API_DOCUMENTATION_RU.md](api_doc/API_DOCUMENTATION_RU.md)** - Справочник всех API endpoints

📖 **[api_doc/API_INDEX.md](api_doc/API_INDEX.md)** - Индекс документации

## Безопасность

⚠️ **Важно:**

1. Измените пароль по умолчанию в production
2. Используйте HTTPS для всех запросов
3. Ограничьте доступ по IP/VPN
4. Логируйте все операции
5. Валидируйте user_id перед использованием

## Troubleshooting

### 401 Unauthorized

```bash
# Проверьте credentials
curl -v -u overleaf:password http://localhost/service/user/projects
```

### 401 Invalid User

```bash
# Проверьте, что user_id существует
curl -u overleaf:password \
  http://localhost/user/507f1f77bcf86cd799439011/personal_info
```

### 403 Forbidden

Убедитесь, что пользователь имеет права на операцию.

## Поддержка

- GitHub Issues: https://github.com/overleaf/overleaf
- Документация: [api_doc/](api_doc/)

---

**Версия**: 1.0 | **Дата**: 2026-01-24

