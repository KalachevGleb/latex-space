# Overleaf CE API - Руководство

Полная документация по взаимодействию с Overleaf Community Edition через API.

## 📚 Документация

### Основные документы

1. **[API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md)** - Полная подробная документация
   - Все endpoints с описанием параметров и ответов
   - Примеры использования на Bash, Node.js и Python
   - Информация об аутентификации и безопасности
   - Rate limits и troubleshooting

2. **[API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md)** - Краткий справочник
   - Таблица всех endpoints
   - Коды ответов
   - Роли участников
   - Быстрые примеры

3. **[api-example.sh](api-example.sh)** - Готовый скрипт для работы с API
   - Интерактивный режим
   - Демонстрация всех возможностей
   - Готовые функции для использования

## 🚀 Быстрый старт

### Требования

- `curl` - для HTTP запросов
- `jq` - для обработки JSON

Установка зависимостей:

```bash
# Ubuntu/Debian
sudo apt-get install curl jq

# macOS
brew install curl jq

# CentOS/RHEL
sudo yum install curl jq
```

### Использование готового скрипта

```bash
# Интерактивный режим
./api-example.sh

# Демонстрация всех возможностей
./api-example.sh demo

# Справка
./api-example.sh help
```

### Настройка через переменные окружения

```bash
export OVERLEAF_URL="http://localhost:3000"
export OVERLEAF_EMAIL="admin@example.com"
export OVERLEAF_PASSWORD="your_password"

./api-example.sh
```

## 📖 Основные операции

### 1. Вход в систему

```bash
# Получить CSRF token
CSRF_TOKEN=$(curl -s http://localhost:3000/dev/csrf)

# Войти в систему
curl -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user@example.com","password":"password"}' \
  http://localhost:3000/login
```

### 2. Создание проекта

```bash
# Создать проект
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"projectName":"My Project"}' \
  http://localhost:3000/project/new
```

### 3. Приглашение участника

```bash
# Пригласить участника
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"colleague@example.com","privileges":"readAndWrite"}' \
  http://localhost:3000/project/$PROJECT_ID/invite
```

### 4. Компиляция проекта

```bash
# Компилировать
curl -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"incrementalCompilesEnabled":true}' \
  http://localhost:3000/project/$PROJECT_ID/compile

# Скачать PDF
curl -b cookies.txt \
  -o output.pdf \
  http://localhost:3000/download/project/$PROJECT_ID/build/$BUILD_ID/output/output.pdf
```

## 🔑 Аутентификация

### Web API (с сессией)

Требуется:
1. Cookie с сессией (через `-c/-b cookies.txt`)
2. CSRF Token в заголовке `X-CSRF-Token`

### Private API

Требуется HTTP Basic Authentication:

```bash
curl -u username:password \
  http://localhost:3000/internal/project/$PROJECT_ID
```

Учётные данные берутся из `services/web/config/settings.defaults.js`:

```javascript
httpAuthUsers: {
  'overleaf': 'password'  // Измените в production!
}
```

## 👥 Роли и права

### Роли участников проекта

| Роль | Значение | Описание |
|------|----------|----------|
| Owner | `owner` | Владелец проекта, полный контроль |
| Editor | `readAndWrite` | Может редактировать проект |
| Viewer | `readOnly` | Только чтение |
| Reviewer | `review` | Комментарии и track changes |

### Уровни прав пользователя

| Уровень | Значение | Описание |
|---------|----------|----------|
| Полные права | `full` | Без ограничений (по умолчанию) |
| Базовые права | `basic` | Просмотр, редактирование, компиляция (без создания/загрузки/копирования/удаления проектов) |

### Защита проектов и файлов

- **Защищённые проекты**: Нельзя удалить (ни в корзину, ни навсегда)
- **Защищённые файлы**: Нельзя удалить, переименовать или изменить (read-only в редакторе)
- Управление защитой доступно только владельцу проекта (owner)
- Защищённые файлы можно скрыть в UI через кнопку в file tree toolbar

## 📊 Основные endpoints

### Проекты

```http
POST   /project/new                      # Создать
GET    /user/projects                    # Список
POST   /project/:id/rename               # Переименовать
DELETE /Project/:id                      # Удалить
POST   /Project/:id/clone                # Клонировать
POST   /project/:id/compile              # Компилировать
```

### Участники

```http
GET    /project/:id/members              # Список
POST   /project/:id/invite               # Пригласить
PUT    /project/:id/users/:user_id       # Изменить роль
DELETE /project/:id/users/:user_id       # Удалить
```

### Защита проектов и файлов

```http
GET    /api/project/:id/protection       # Статус защиты проекта
POST   /api/project/:id/protection       # Установить защиту проекта
GET    /api/project/:id/protected-files  # Список защищённых файлов
POST   /api/project/:id/protected-files  # Установить защищённые файлы
```

### Управление правами пользователей

```http
GET    /api/user/:user_id/permissions    # Получить права пользователя
POST   /api/user/:user_id/permissions    # Установить права пользователя
```

### Private API

```http
GET    /internal/project/:id             # Детали проекта
GET    /project/:id/doc/:doc_id          # Получить документ
POST   /project/:id/doc/:doc_id          # Обновить документ
```

## 💻 Примеры на разных языках

### Bash

```bash
source api-example.sh

login
PROJECT_ID=$(create_project "Test Project")
compile_project "$PROJECT_ID"
logout
```

### Python

```python
import requests

class OverleafAPI:
    def __init__(self, base_url, email, password):
        self.base_url = base_url
        self.session = requests.Session()
        self.csrf_token = None
        self.login(email, password)
    
    def login(self, email, password):
        # Получить CSRF
        self.csrf_token = self.session.get(
            f'{self.base_url}/dev/csrf'
        ).text
        
        # Войти
        self.session.post(
            f'{self.base_url}/login',
            json={'email': email, 'password': password},
            headers={'X-CSRF-Token': self.csrf_token}
        )
    
    def create_project(self, name):
        resp = self.session.post(
            f'{self.base_url}/project/new',
            json={'projectName': name},
            headers={'X-CSRF-Token': self.csrf_token}
        )
        return resp.json()['project_id']

# Использование
api = OverleafAPI('http://localhost:3000', 'user@example.com', 'pass')
project_id = api.create_project('My Project')
```

### Node.js

```javascript
const axios = require('axios');

class OverleafAPI {
  constructor(baseURL) {
    this.client = axios.create({
      baseURL,
      withCredentials: true
    });
    this.csrfToken = null;
  }

  async login(email, password) {
    // Получить CSRF
    const csrfResp = await this.client.get('/dev/csrf');
    this.csrfToken = csrfResp.data;
    
    // Войти
    await this.client.post('/login', 
      { email, password },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );
  }

  async createProject(name) {
    const resp = await this.client.post('/project/new',
      { projectName: name },
      { headers: { 'X-CSRF-Token': this.csrfToken } }
    );
    return resp.data.project_id;
  }
}

// Использование
(async () => {
  const api = new OverleafAPI('http://localhost:3000');
  await api.login('user@example.com', 'password');
  const projectId = await api.createProject('My Project');
  console.log('Created:', projectId);
})();
```

## ⚠️ Важные замечания

### Безопасность

1. **В production используйте HTTPS** для всех API запросов
2. **Меняйте пароли** в `httpAuthUsers` для Private API
3. **Используйте переменные окружения** для хранения credentials
4. **Не коммитьте** `cookies.txt` и credentials в git

### Rate Limiting

API имеет ограничения на частоту запросов:

- Создание проекта: 20/мин
- Компиляция: 800/час
- Login: 20/мин (по IP), 10/2мин (по email)

При превышении получите `429 Too Many Requests`.

### CSRF Protection

Все мутирующие запросы (POST/PUT/DELETE) требуют CSRF token:

```bash
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3000/dev/csrf)
```

## 🔧 Troubleshooting

### Проблема: 403 Forbidden

**Причина**: Отсутствует или неверный CSRF token

**Решение**: 
```bash
# Получите свежий CSRF token перед каждым запросом
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3000/dev/csrf)
```

### Проблема: 401 Unauthorized

**Причина**: Истекла сессия или неверные credentials

**Решение**:
```bash
# Войдите заново
./api-example.sh
# Выберите "1. Войти"
```

### Проблема: jq: command not found

**Решение**:
```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

### Проблема: Cannot connect to localhost:3000

**Решение**:
```bash
# Проверьте, что Overleaf запущен
cd /Users/gleb/Projects/overleaf
bin/dev up

# Или проверьте URL
export OVERLEAF_URL="http://your-server:port"
```

## 📝 Создание пользователя

Overleaf CE не предоставляет публичный API для создания пользователей. Варианты:

### Через веб-интерфейс

Если регистрация включена:
```
http://localhost:3000/register
```

### Программно (Node.js)

```javascript
// В services/web выполните:
const UserRegistrationHandler = require('./app/src/Features/User/UserRegistrationHandler');

const user = await UserRegistrationHandler.promises.registerNewUser({
  email: 'newuser@example.com',
  password: 'secure_password',
  first_name: 'John',
  last_name: 'Doe'
});
```

### Через MongoDB (для dev/admin)

```javascript
const UserCreator = require('./app/src/Features/User/UserCreator');
const AuthenticationManager = require('./app/src/Features/Authentication/AuthenticationManager');

// Создать пользователя
const user = await UserCreator.promises.createNewUser({
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User'
});

// Установить пароль
await AuthenticationManager.promises.setUserPassword(user, 'password123');
```

## 🔗 Дополнительные ресурсы

- [Официальная документация Overleaf](https://github.com/overleaf/overleaf/wiki)
- [Полная документация API](API_DOCUMENTATION_RU.md)
- [Краткий справочник](API_QUICK_REFERENCE.md)
- [GitHub Issues](https://github.com/overleaf/overleaf/issues)

## 📞 Поддержка

При возникновении проблем:

1. Проверьте [Troubleshooting](#-troubleshooting)
2. Ознакомьтесь с [полной документацией](API_DOCUMENTATION_RU.md)
3. Проверьте логи Overleaf: `bin/dev logs`
4. Создайте issue на GitHub

## 📄 Лицензия

Документация распространяется вместе с Overleaf CE под лицензией AGPL-3.0.

---

**Версия**: 2.0
**Дата**: 2024-10-29
**Совместимость**: Overleaf CE (latest main branch)

**Изменения в v2.0:**
- Добавлена защита проектов и файлов
- Добавлено управление правами пользователей (full/basic)
- Обновлена документация с примерами использования новых API

