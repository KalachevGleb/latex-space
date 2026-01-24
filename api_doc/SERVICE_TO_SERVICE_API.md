# Service-to-Service API для Overleaf CE

## Обзор

Service API позволяет вызывать все Web API endpoints из другого сервиса с Basic Authentication вместо браузерной сессии и CSRF токенов.

**Для чего:** Интеграция с внешними системами (peer-review, LMS, автоматизация) без эмуляции браузера.

**Важно:** Все операции выполняются от имени администратора с указанием конкретного пользователя через заголовок.

## Ключевые отличия от Web API

| Аспект | Web API | Service-to-Service API |
|--------|---------|------------------------|
| **Префикс URL** | `/` | `/service/` |
| **Аутентификация** | Cookie сессия | HTTP Basic Auth |
| **CSRF защита** | Требуется токен | Не требуется |
| **Контекст пользователя** | Из сессии | Через заголовок `X-Overleaf-User-Id` |
| **Использование** | Браузер, curl с cookies | Микросервисы, backend-to-backend |

## Быстрый старт

### Пример 1: Получить список проектов пользователя

```bash
# Web API (требует сессию и CSRF)
curl -b cookies.txt \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  http://localhost/user/projects

# Service API (только Basic Auth + user ID)
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  http://localhost/service/user/projects
```

### Пример 2: Создать проект от имени пользователя

```bash
# Service API
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"API Test Project"}' \
  http://localhost/service/project/new
```

### Пример 3: Компилировать проект

```bash
# Service API
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -d '{"incrementalCompilesEnabled":true}' \
  http://localhost/service/project/$PROJECT_ID/compile
```

## Настройка

### Включение Service API

Service API настраивается через административную панель Overleaf:

1. Войдите как администратор
2. Перейдите в **Admin → Settings → Service API**
3. Включите Service API и установите пароль
4. Опционально: ограничьте доступ только с localhost

**Альтернатива:** Переменные окружения (для автоматической настройки при установке):
```bash
export SERVICE_API_ENABLED=true
export SERVICE_API_PASSWORD="secure-password"
export SERVICE_API_LOCALHOST_ONLY=true  # опционально
```

### Аутентификация

Service API использует HTTP Basic Authentication:
- **Username:** `overleaf` (фиксированный)
- **Password:** Устанавливается в админ-панели или через переменные окружения

### Указание пользователя

Операции выполняются от имени администратора, но действуют от лица конкретного пользователя:

- **`X-Overleaf-User-Id`** - ID пользователя (предпочтительно)
- **`X-Overleaf-User-Email`** - Email пользователя

```bash
curl -u overleaf:password \
  -H "X-Overleaf-User-Id: 507f1f77bcf86cd799439011" \
  http://localhost/service/user/projects
```

## Доступные endpoints

Все Web API endpoints доступны через `/service/` префикс:

| Web API | Service API |
|---------|-------------|
| `/user/projects` | `/service/user/projects` |
| `/project/new` | `/service/project/new` |
| `/project/:id/compile` | `/service/project/:id/compile` |
| `/api/project/:id/comments` | `/service/api/project/:id/comments` |

### Основные операции

#### Управление проектами

```bash
# Список проектов
GET /service/user/projects

# Создать проект
POST /service/project/new
Body: {"projectName": "New Project"}

# Переименовать проект
POST /service/project/:Project_id/rename
Body: {"newProjectName": "Updated Name"}

# Клонировать проект
POST /service/Project/:Project_id/clone
Body: {"projectName": "Cloned Project"}

# Удалить проект
DELETE /service/Project/:Project_id

# Получить структуру проекта
GET /service/project/:Project_id/entities
```

#### Управление участниками

```bash
# Список участников
GET /service/project/:Project_id/members

# Добавить участника
POST /service/project/:Project_id/add
Body: {"email": "user@example.com", "privileges": "readAndWrite"}

# Изменить роль
PUT /service/project/:Project_id/users/:user_id
Body: {"privilegeLevel": "readOnly"}

# Удалить участника
DELETE /service/project/:Project_id/users/:user_id
```

#### Компиляция

```bash
# Компилировать проект
POST /service/project/:Project_id/compile
Body: {"incrementalCompilesEnabled": true}

# Скачать PDF
GET /service/download/project/:Project_id/build/:build_id/output/output.pdf

# Остановить компиляцию
POST /service/project/:Project_id/compile/stop
```

#### Комментарии и Review

```bash
# Получить все комментарии
GET /service/api/project/:Project_id/comments

# Получить треды
GET /service/project/:Project_id/threads

# Добавить сообщение в тред
POST /service/project/:Project_id/thread/:thread_id/messages
Body: {"content": "Comment text"}

# Отметить как решённый
POST /service/project/:Project_id/doc/:Doc_id/thread/:thread_id/resolve
```

#### Защита проектов и файлов

```bash
# Установить защиту проекта
POST /service/api/project/:Project_id/protection
Body: {"isProtected": true}

# Получить статус защиты
GET /service/api/project/:Project_id/protection

# Установить защищённые файлы
POST /service/api/project/:Project_id/protected-files
Body: {"protectedFiles": ["/main.tex", "/config.sty"]}

# Получить список защищённых файлов
GET /service/api/project/:Project_id/protected-files
```

#### Управление правами пользователей (Admin)

```bash
# Установить права пользователя
POST /service/api/user/:user_id/permissions
Body: {"permissions": "basic"}

# Получить права пользователя
GET /service/api/user/:user_id/permissions
```

## Примеры использования

### Python клиент

```python
import requests
from typing import Optional

class OverleafServiceAPI:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url
        self.auth = (username, password)
        self.session = requests.Session()
        self.session.auth = self.auth
    
    def _make_request(self, method: str, path: str, user_id: Optional[str] = None,
                     user_email: Optional[str] = None, **kwargs):
        """Выполнить запрос к Service API"""
        url = f"{self.base_url}/service{path}"
        headers = kwargs.pop('headers', {})
        
        # Добавить контекст пользователя
        if user_id:
            headers['X-Overleaf-User-Id'] = user_id
        elif user_email:
            headers['X-Overleaf-User-Email'] = user_email
        
        response = self.session.request(method, url, headers=headers, **kwargs)
        response.raise_for_status()
        return response
    
    def list_projects(self, user_id: str):
        """Получить список проектов пользователя"""
        response = self._make_request('GET', '/user/projects', user_id=user_id)
        return response.json()
    
    def create_project(self, user_id: str, name: str, template: str = 'basic'):
        """Создать проект от имени пользователя"""
        response = self._make_request(
            'POST', '/project/new',
            user_id=user_id,
            json={'projectName': name, 'template': template}
        )
        return response.json()
    
    def compile_project(self, user_id: str, project_id: str, **options):
        """Компилировать проект"""
        response = self._make_request(
            'POST', f'/project/{project_id}/compile',
            user_id=user_id,
            json=options
        )
        return response.json()
    
    def download_pdf(self, user_id: str, project_id: str, build_id: str, output_path: str):
        """Скачать PDF"""
        response = self._make_request(
            'GET', f'/download/project/{project_id}/build/{build_id}/output/output.pdf',
            user_id=user_id,
            stream=True
        )
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    
    def get_comments(self, user_id: str, project_id: str):
        """Получить все комментарии проекта"""
        response = self._make_request(
            'GET', f'/api/project/{project_id}/comments',
            user_id=user_id
        )
        return response.json()
    
    def add_collaborator(self, user_id: str, project_id: str, email: str, privileges: str = 'readAndWrite'):
        """Добавить участника в проект"""
        response = self._make_request(
            'POST', f'/project/{project_id}/add',
            user_id=user_id,
            json={'email': email, 'privileges': privileges}
        )
        return response.json()

# Использование
api = OverleafServiceAPI('http://localhost', 'overleaf', 'password')

# Создать проект от имени пользователя
user_id = '507f1f77bcf86cd799439011'
project = api.create_project(user_id, 'Service API Test')
project_id = project['project_id']

# Компилировать
compile_result = api.compile_project(user_id, project_id, incrementalCompilesEnabled=True)
build_id = compile_result['buildId']

# Скачать PDF
api.download_pdf(user_id, project_id, build_id, 'output.pdf')

# Получить комментарии
comments = api.get_comments(user_id, project_id)
print(f"Found {len(comments['comments'])} comments")
```

### Node.js клиент

```javascript
const axios = require('axios');

class OverleafServiceAPI {
  constructor(baseURL, username, password) {
    this.client = axios.create({
      baseURL: `${baseURL}/service`,
      auth: { username, password }
    });
  }

  async listProjects(userId) {
    const response = await this.client.get('/user/projects', {
      headers: { 'X-Overleaf-User-Id': userId }
    });
    return response.data;
  }

  async createProject(userId, name, template = 'basic') {
    const response = await this.client.post('/project/new',
      { projectName: name, template },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
    return response.data;
  }

  async compileProject(userId, projectId, options = {}) {
    const response = await this.client.post(`/project/${projectId}/compile`,
      options,
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
    return response.data;
  }

  async downloadPDF(userId, projectId, buildId, outputPath) {
    const response = await this.client.get(
      `/download/project/${projectId}/build/${buildId}/output/output.pdf`,
      {
        headers: { 'X-Overleaf-User-Id': userId },
        responseType: 'stream'
      }
    );
    
    const fs = require('fs');
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async getComments(userId, projectId) {
    const response = await this.client.get(`/api/project/${projectId}/comments`, {
      headers: { 'X-Overleaf-User-Id': userId }
    });
    return response.data;
  }

  async addCollaborator(userId, projectId, email, privileges = 'readAndWrite') {
    const response = await this.client.post(`/project/${projectId}/add`,
      { email, privileges },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
    return response.data;
  }
}

// Использование
(async () => {
  const api = new OverleafServiceAPI('http://localhost', 'overleaf', 'password');
  const userId = '507f1f77bcf86cd799439011';

  // Создать проект
  const project = await api.createProject(userId, 'Service API Test');
  console.log('Created project:', project.project_id);

  // Компилировать
  const compileResult = await api.compileProject(userId, project.project_id, {
    incrementalCompilesEnabled: true
  });
  console.log('Build ID:', compileResult.buildId);

  // Скачать PDF
  await api.downloadPDF(userId, project.project_id, compileResult.buildId, 'output.pdf');
  console.log('PDF downloaded');

  // Получить комментарии
  const comments = await api.getComments(userId, project.project_id);
  console.log(`Found ${comments.comments.length} comments`);
})();
```

### Bash скрипт

```bash
#!/bin/bash

# Конфигурация
OVERLEAF_URL="http://localhost"
SERVICE_USER="overleaf"
SERVICE_PASS="password"
USER_ID="507f1f77bcf86cd799439011"

# Функция для выполнения запросов
service_request() {
    local method=$1
    local path=$2
    shift 2
    
    curl -s -u "$SERVICE_USER:$SERVICE_PASS" \
        -H "X-Overleaf-User-Id: $USER_ID" \
        -X "$method" \
        "$@" \
        "$OVERLEAF_URL/service$path"
}

# Список проектов
list_projects() {
    service_request GET "/user/projects" | jq .
}

# Создать проект
create_project() {
    local name=$1
    service_request POST "/project/new" \
        -H "Content-Type: application/json" \
        -d "{\"projectName\":\"$name\"}" | jq .
}

# Компилировать проект
compile_project() {
    local project_id=$1
    service_request POST "/project/$project_id/compile" \
        -H "Content-Type: application/json" \
        -d '{"incrementalCompilesEnabled":true}' | jq .
}

# Скачать PDF
download_pdf() {
    local project_id=$1
    local build_id=$2
    local output_file=$3
    
    service_request GET "/download/project/$project_id/build/$build_id/output/output.pdf" \
        -o "$output_file"
}

# Получить комментарии
get_comments() {
    local project_id=$1
    service_request GET "/api/project/$project_id/comments" | jq .
}

# Добавить участника
add_collaborator() {
    local project_id=$1
    local email=$2
    local privileges=${3:-readAndWrite}
    
    service_request POST "/project/$project_id/add" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"privileges\":\"$privileges\"}" | jq .
}

# Пример использования
echo "Listing projects..."
list_projects

echo "Creating project..."
PROJECT_RESPONSE=$(create_project "Service API Test")
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.project_id')
echo "Created project: $PROJECT_ID"

echo "Compiling project..."
COMPILE_RESPONSE=$(compile_project "$PROJECT_ID")
BUILD_ID=$(echo "$COMPILE_RESPONSE" | jq -r '.buildId')
echo "Build ID: $BUILD_ID"

echo "Downloading PDF..."
download_pdf "$PROJECT_ID" "$BUILD_ID" "output.pdf"
echo "PDF downloaded to output.pdf"

echo "Getting comments..."
get_comments "$PROJECT_ID"

echo "Adding collaborator..."
add_collaborator "$PROJECT_ID" "colleague@example.com" "readAndWrite"
```

## Сценарии использования

### 1. Интеграция с системой peer-review

```python
class PeerReviewIntegration:
    def __init__(self, overleaf_api):
        self.api = overleaf_api
    
    def create_review_project(self, author_id: str, manuscript_title: str, reviewers: list):
        """Создать проект для рецензирования"""
        # Создать проект от имени автора
        project = self.api.create_project(author_id, f"Review: {manuscript_title}")
        project_id = project['project_id']
        
        # Добавить рецензентов
        for reviewer_email in reviewers:
            self.api.add_collaborator(author_id, project_id, reviewer_email, 'review')
        
        # Защитить основные файлы от изменений рецензентами
        self.api._make_request(
            'POST', f'/api/project/{project_id}/protected-files',
            user_id=author_id,
            json={'protectedFiles': ['/main.tex', '/bibliography.bib']}
        )
        
        return project_id
    
    def collect_reviews(self, author_id: str, project_id: str):
        """Собрать все комментарии рецензентов"""
        comments = self.api.get_comments(author_id, project_id)
        
        reviews_by_reviewer = {}
        for comment in comments['comments']:
            for message in comment['messages']:
                reviewer = message['author']['email']
                if reviewer not in reviews_by_reviewer:
                    reviews_by_reviewer[reviewer] = []
                reviews_by_reviewer[reviewer].append({
                    'file': comment['file'],
                    'text': message['text'],
                    'timestamp': message['timestamp']
                })
        
        return reviews_by_reviewer
```

### 2. Автоматизированная обработка проектов

```javascript
class BatchProjectProcessor {
  constructor(api) {
    this.api = api;
  }

  async processUserProjects(userId, processFn) {
    // Получить все проекты пользователя
    const projects = await this.api.listProjects(userId);
    
    // Обработать каждый проект
    const results = [];
    for (const project of projects.projects) {
      try {
        const result = await processFn(project);
        results.push({ projectId: project._id, success: true, result });
      } catch (error) {
        results.push({ projectId: project._id, success: false, error: error.message });
      }
    }
    
    return results;
  }

  async compileAllProjects(userId) {
    return this.processUserProjects(userId, async (project) => {
      const compileResult = await this.api.compileProject(userId, project._id);
      return { buildId: compileResult.buildId, status: compileResult.status };
    });
  }

  async backupAllProjects(userId, backupDir) {
    return this.processUserProjects(userId, async (project) => {
      const compileResult = await this.api.compileProject(userId, project._id);
      const pdfPath = `${backupDir}/${project.name}.pdf`;
      await this.api.downloadPDF(userId, project._id, compileResult.buildId, pdfPath);
      return { pdfPath };
    });
  }
}
```

### 3. Мониторинг и аналитика

```python
class OverleafAnalytics:
    def __init__(self, api):
        self.api = api
    
    def get_project_activity(self, user_id: str, project_id: str):
        """Получить статистику активности в проекте"""
        comments = self.api.get_comments(user_id, project_id)
        
        stats = {
            'total_comments': len(comments['comments']),
            'resolved_comments': sum(1 for c in comments['comments'] if c['resolved']),
            'active_threads': sum(1 for c in comments['comments'] if not c['resolved']),
            'participants': set()
        }
        
        for comment in comments['comments']:
            for message in comment['messages']:
                stats['participants'].add(message['author']['email'])
        
        stats['participants'] = list(stats['participants'])
        stats['participant_count'] = len(stats['participants'])
        
        return stats
    
    def generate_report(self, user_id: str, project_ids: list):
        """Сгенерировать отчёт по нескольким проектам"""
        report = []
        
        for project_id in project_ids:
            try:
                activity = self.get_project_activity(user_id, project_id)
                report.append({
                    'project_id': project_id,
                    'success': True,
                    'stats': activity
                })
            except Exception as e:
                report.append({
                    'project_id': project_id,
                    'success': False,
                    'error': str(e)
                })
        
        return report
```

## Безопасность

### Рекомендации

1. **Храните credentials в безопасности**
   ```bash
   # Используйте переменные окружения
   export WEB_API_USER="service-name"
   export WEB_API_PASSWORD="$(openssl rand -base64 32)"
   ```

2. **Используйте HTTPS в production**
   ```python
   api = OverleafServiceAPI('https://overleaf.example.com', user, password)
   ```

3. **Ограничьте доступ по IP**
   - Настройте firewall для доступа только с доверенных серверов
   - Используйте VPN или private network для service-to-service коммуникации

4. **Логируйте все операции**
   ```python
   import logging
   
   logger = logging.getLogger('overleaf_service_api')
   logger.info(f'Creating project for user {user_id}')
   ```

5. **Валидируйте user_id**
   ```python
   import re
   
   def validate_user_id(user_id: str) -> bool:
       # MongoDB ObjectId format
       return bool(re.match(r'^[0-9a-f]{24}$', user_id))
   ```

### Ограничения

- Service API подчиняется тем же rate limits, что и Web API
- Требуются валидные user_id для операций, требующих аутентификации
- Нельзя создавать пользователей через Service API (используйте административные инструменты)

## Troubleshooting

### 401 Unauthorized

**Проблема**: Неверные credentials или отсутствует Basic Auth

**Решение**:
```bash
# Проверьте credentials
curl -v -u overleaf:password http://localhost/service/user/projects

# Убедитесь, что заголовок Authorization присутствует
# Authorization: Basic b3ZlcmxlYWY6cGFzc3dvcmQ=
```

### 401 Invalid User

**Проблема**: Пользователь с указанным ID или email не найден

**Решение**:
```bash
# Проверьте, что user_id существует
curl -u overleaf:password \
  http://localhost/user/507f1f77bcf86cd799439011/personal_info

# Или используйте email
curl -u overleaf:password \
  -H "X-Overleaf-User-Email: user@example.com" \
  http://localhost/service/user/projects
```

### 403 Forbidden

**Проблема**: Недостаточно прав для операции

**Решение**:
- Убедитесь, что пользователь имеет права на проект
- Для admin операций убедитесь, что пользователь является администратором

### 429 Too Many Requests

**Проблема**: Превышен rate limit

**Решение**:
```python
import time
from requests.exceptions import HTTPError

def retry_with_backoff(func, max_retries=3):
    for i in range(max_retries):
        try:
            return func()
        except HTTPError as e:
            if e.response.status_code == 429:
                wait_time = 2 ** i  # Exponential backoff
                time.sleep(wait_time)
            else:
                raise
    raise Exception('Max retries exceeded')
```

## Миграция с Web API на Service API

### До (Web API с сессией)

```python
import requests

session = requests.Session()

# Получить CSRF
csrf_token = session.get('http://localhost/dev/csrf').text

# Войти
session.post('http://localhost/login',
    json={'email': 'user@example.com', 'password': 'password'},
    headers={'X-CSRF-Token': csrf_token}
)

# Создать проект
response = session.post('http://localhost/project/new',
    json={'projectName': 'Test'},
    headers={'X-CSRF-Token': csrf_token}
)
```

### После (Service API)

```python
import requests

auth = ('overleaf', 'password')
user_id = '507f1f77bcf86cd799439011'

# Создать проект (одним запросом, без сессии и CSRF)
response = requests.post('http://localhost/service/project/new',
    json={'projectName': 'Test'},
    auth=auth,
    headers={'X-Overleaf-User-Id': user_id}
)
```

**Преимущества**:
- ✅ Нет необходимости управлять сессией
- ✅ Нет необходимости в CSRF токенах
- ✅ Проще для автоматизации
- ✅ Лучше для service-to-service интеграции
- ✅ Меньше накладных расходов (меньше запросов)

## Дополнительная информация

### Связанные документы

- [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md) - Полная документация Web API
- [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md) - Краткий справочник endpoints
- [API_README.md](API_README.md) - Руководство по началу работы

### Поддержка

Для вопросов и проблем:
- GitHub Issues: https://github.com/overleaf/overleaf
- Community Edition Wiki: https://github.com/overleaf/overleaf/wiki

---

**Версия**: 1.0
**Дата**: 2026-01-24
**Совместимость**: Overleaf CE (latest main branch)

