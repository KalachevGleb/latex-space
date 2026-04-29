# API для получения комментариев из Review Panel

## ✅ Реализовано

Добавлен новый API endpoint для получения комментариев из Review панели Overleaf в формате JSON.

### Endpoint

```
GET /api/project/:Project_id/comments
```

### Требования

- Пользователь должен иметь доступ на чтение проекта
- Используется стандартная аутентификация через cookies и CSRF token

### Формат ответа

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
        }
      ],
      "resolved": false
    }
  ]
}
```

## Структура данных

Для каждого комментария возвращается:

### Основные поля

- **`thread_id`** (string) - Уникальный идентификатор треда комментариев
- **`file`** (string) - Путь к файлу относительно корня проекта (например, `main.tex`, `sections/intro.tex`)
- **`position`** (object) - Позиция выделенного текста в файле
  - **`start`** (number) - Начальная позиция в символах от начала файла
  - **`end`** (number) - Конечная позиция в символах
- **`text`** (string) - Выделенный текст, к которому относится комментарий
- **`resolved`** (boolean) - Статус комментария (решён или нет)

### Сообщения (messages)

Массив сообщений в треде комментариев:

- **`author`** (object | null) - Информация об авторе
  - **`id`** (string) - ID пользователя
  - **`email`** (string) - Email пользователя
  - **`first_name`** (string) - Имя
  - **`last_name`** (string) - Фамилия
  - **`alias`** (string, optional) - Псевдоним (если установлен в настройках проекта)
- **`text`** (string) - Текст сообщения
- **`timestamp`** (string) - Время создания сообщения в формате ISO 8601

## Примеры использования

### Bash (curl)

```bash
#!/bin/bash

BASE_URL="http://localhost"

# Получить CSRF token
CSRF_TOKEN=$(curl -s "${BASE_URL}/dev/csrf")

# Войти в систему
curl -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user@example.com","password":"password123"}' \
  "${BASE_URL}/login"

# Получить комментарии проекта
PROJECT_ID="60a7b1234567890abcdef123"
curl -s -b cookies.txt \
  "${BASE_URL}/api/project/${PROJECT_ID}/comments" | jq .
```

### Python

```python
import requests

BASE_URL = 'http://localhost'

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

# Обработать комментарии
for comment in comments_data['comments']:
    print(f"Файл: {comment['file']}")
    print(f"Позиция: {comment['position']['start']}-{comment['position']['end']}")
    print(f"Сообщений: {len(comment['messages'])}")
    print("---")
```

### JavaScript (Node.js)

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost';

async function getComments(email, password, projectId) {
  // Создать клиент с поддержкой cookies
  const client = axios.create({
    baseURL: BASE_URL,
    withCredentials: true
  });
  
  // Получить CSRF token
  const csrfResponse = await client.get('/dev/csrf');
  const csrfToken = csrfResponse.data;
  
  // Войти в систему
  await client.post('/login', {
    email,
    password
  }, {
    headers: { 'X-CSRF-Token': csrfToken }
  });
  
  // Получить комментарии
  const response = await client.get(`/api/project/${projectId}/comments`);
  return response.data;
}

// Использование
getComments('user@example.com', 'password123', '60a7b1234567890abcdef123')
  .then(data => {
    console.log(`Found ${data.comments.length} comments`);
    data.comments.forEach(comment => {
      console.log(`- ${comment.file}: ${comment.messages.length} messages`);
    });
  })
  .catch(err => console.error('Error:', err.message));
```

## Файлы

### Созданные файлы

1. **Контроллер**: `services/web/app/src/Features/Comments/CommentsController.mjs`
   - Добавлена функция `getCommentsWithPositions`

2. **Маршрут**: `services/web/app/src/router.mjs`
   - Добавлен маршрут `GET /api/project/:Project_id/comments`

3. **Примеры**:
   - `api_doc/example_get_comments.py` - Python скрипт для получения комментариев
   - `test_comments_api.sh` - Bash скрипт для тестирования
   - `test_comments_endpoint.sh` - Проверка регистрации endpoint

### Обновлённые файлы

1. **Документация**:
   - `api_doc/API_QUICK_REFERENCE.md` - Добавлена секция "Комментарии (Review Panel)"
   - `api_doc/API_DOCUMENTATION_RU.md` - Добавлена полная документация с примерами

## Как использовать

### 1. Создайте проект и добавьте комментарии

1. Откройте Overleaf: http://localhost
2. Создайте или откройте проект
3. Выделите текст в редакторе
4. Нажмите "Add comment" во всплывающем меню
5. Введите комментарий и нажмите Enter

### 2. Получите ID проекта

ID проекта можно найти в URL:
```
http://localhost/project/60a7b1234567890abcdef123
                         ^^^^^^^^^^^^^^^^^^^^^^^^
                         Это ID проекта
```

### 3. Используйте API

```bash
# С помощью Python скрипта
python3 api_doc/example_get_comments.py <project_id> <email> <password>

# Или с помощью curl
./test_comments_api.sh <project_id>
```

## Технические детали

### Архитектура

Endpoint объединяет данные из трёх источников:

1. **Docstore** - получает ranges (позиции комментариев в документах)
2. **MongoDB** (`projectHistoryComments`) - получает threads (сообщения комментариев)
3. **Project** - получает пути к файлам и псевдонимы пользователей

### Процесс работы

```
1. Запрос → GET /api/project/:id/comments
2. Проверка прав доступа (AuthorizationMiddleware)
3. Получение путей к документам (ProjectEntityHandler)
4. Получение ranges из docstore (DocstoreManager)
5. Получение threads из MongoDB
6. Объединение данных
7. Получение информации о пользователях
8. Возврат JSON ответа
```

### Права доступа

- Endpoint защищён `AuthorizationMiddleware.ensureUserCanReadProject`
- Требуется аутентификация через cookies
- Пользователь должен иметь доступ на чтение проекта (owner, editor, viewer, reviewer)

### Коды ответов

- **200 OK** - Успешно получены комментарии
- **401 Unauthorized** - Требуется аутентификация
- **403 Forbidden** - Нет прав доступа к проекту
- **404 Not Found** - Проект не найден
- **500 Internal Server Error** - Внутренняя ошибка сервера

## Примечания

### Позиции в тексте

- Позиции указаны в символах от начала файла
- Включают переводы строк (`\n`)
- Начинаются с 0 (первый символ = позиция 0)

### Псевдонимы

- Если в настройках проекта установлены псевдонимы для пользователей, они будут включены в поле `alias`
- Используется для анонимизации рецензентов

### Удалённые комментарии

- Удалённые комментарии не возвращаются
- Если thread удалён, но range ещё существует в документе, комментарий не будет включён в ответ

### Производительность

- Endpoint делает несколько запросов к базе данных и внутренним сервисам
- Для больших проектов с множеством комментариев может потребоваться время
- Рекомендуется кэшировать результаты на стороне клиента

## Тестирование

### Проверка регистрации endpoint

```bash
./test_comments_endpoint.sh
```

### Полное тестирование с аутентификацией

```bash
./test_comments_api.sh <project_id>
```

### Python скрипт

```bash
python3 api_doc/example_get_comments.py <project_id> <email> <password>
```

## Поддержка

При возникновении проблем:

1. Проверьте логи web сервиса:
   ```bash
   cd develop
   docker-compose logs web --tail=50
   ```

2. Убедитесь, что сервис запущен:
   ```bash
   docker-compose ps web
   ```

3. Проверьте, что проект существует и у вас есть к нему доступ

