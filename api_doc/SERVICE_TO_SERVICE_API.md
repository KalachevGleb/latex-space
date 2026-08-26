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

#### Управление файлами и документами

**Важно:** Service API позволяет изменять защищённые файлы, в отличие от обычного Web API.

```bash
# Загрузить файл в проект
POST /service/project/:Project_id/upload
Content-Type: multipart/form-data
Headers:
  - name: имя файла (обязательно)
  - qqfile: содержимое файла
Query params:
  - folder_id: ID папки для загрузки (опционально, по умолчанию корень)
Body: {
  "name": "document.pdf",
  "relativePath": "subfolder/document.pdf"  # опционально, для сохранения структуры папок
}

# Создать новый документ (LaTeX)
POST /service/project/:Project_id/doc
Body: {
  "name": "chapter1.tex",
  "parent_folder_id": "folder_id"  # опционально
}

# Создать новую папку
POST /service/project/:Project_id/folder
Body: {
  "name": "chapters",
  "parent_folder_id": "folder_id"  # опционально
}

# Переименовать файл/документ/папку
POST /service/project/:Project_id/:entity_type/:entity_id/rename
Body: {"name": "new_name.tex"}
# entity_type: "file", "doc", или "folder"

# Переместить файл/документ/папку
POST /service/project/:Project_id/:entity_type/:entity_id/move
Body: {"folder_id": "target_folder_id"}
# entity_type: "file", "doc", или "folder"

# Удалить файл
DELETE /service/project/:Project_id/file/:entity_id

# Удалить документ
DELETE /service/project/:Project_id/doc/:entity_id

# Удалить папку
DELETE /service/project/:Project_id/folder/:entity_id

# Скачать файл
GET /service/project/:Project_id/file/:File_id

# Скачать документ (текст)
GET /service/project/:Project_id/doc/:Doc_id/download

# Загрузить файл по пути (Service API, с сохранением истории)
POST /service/project/:Project_id/upload-by-path
Content-Type: multipart/form-data
Body: {
  "name": "figure.png",
  "path": "/images/figure.png",  # полный путь, папки создаются автоматически
  "qqfile": <binary data>
}
Response: {
  "success": true,
  "entity_id": "file_id",
  "entity_type": "file",
  "hash": "file_hash",
  "path": "/images/figure.png",
  "isNew": false  # true если файл новый, false если обновлён
}

# Синхронизировать проект из ZIP (Service API, с сохранением истории)
POST /service/project/:Project_id/sync-from-zip
Content-Type: multipart/form-data
Body: {
  "qqfile": <ZIP archive>
}
Response: {
  "success": true,
  "deleted": 2,   # количество удалённых файлов
  "updated": 5,   # количество обновлённых файлов
  "added": 3      # количество добавленных файлов
}
# Примечание: История и комментарии сохраняются при обновлении файлов
```

#### Пользователи

```bash
# Пригласить пользователя (создаёт аккаунт и шлёт письмо с активацией)
POST /service/api/user/invite
Body: {"email": "user@example.com"}

# Создать пользователя без письма и подтверждения (служебные/бот-аккаунты, например ИИ-рецензент)
POST /service/api/user/create
Body: {"email": "reviewer-bot@ai.local", "first_name": "ИИ", "last_name": "рецензент"}
# Ответ 201: {"status":"created","user_id":"...","email":"...","first_name":"...","last_name":"..."}
# Ответ 409 (уже есть): {"error":"email_already_registered","user_id":"..."}
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

# Добавить комментарий к фрагменту текста (от имени пользователя из X-Overleaf-User-Id)
POST /service/api/project/:Project_id/doc/:doc_id/comments
Body: {"pos": 120, "text": "cellular automata", "content": "Уточните класс автоматов", "author_alias": "ИИ рецензия"}

# Добавить правки как track changes (с опциональными комментариями)
POST /service/api/project/:Project_id/doc/:doc_id/suggestions
Body: {"items": [{"pos": 75, "old_text": "studys", "new_text": "studies", "comment": "Опечатка"}]}

# Задать отображаемое имя участника в проекте (псевдоним)
PUT /service/api/project/:Project_id/users/:user_id/alias
Body: {"alias": "ИИ корректура"}   # null или "" — убрать псевдоним
```

Подробное описание (позиции, диффы, коды ошибок, сценарий «ИИ-рецензент») — в
[API_DOCUMENTATION_RU.md, раздел «Review API»](API_DOCUMENTATION_RU.md#review-api-комментарии-и-правки-от-сервисов-и-ии).

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

    # === Файловые операции ===

    def upload_file(self, user_id: str, project_id: str, file_path: str, folder_id: Optional[str] = None):
        """Загрузить файл в проект"""
        import os
        file_name = os.path.basename(file_path)

        url = f'/project/{project_id}/upload'
        if folder_id:
            url += f'?folder_id={folder_id}'

        with open(file_path, 'rb') as f:
            files = {'qqfile': (file_name, f)}
            data = {'name': file_name}
            response = self._make_request(
                'POST', url,
                user_id=user_id,
                files=files,
                data=data
            )
        return response.json()

    def create_doc(self, user_id: str, project_id: str, name: str, parent_folder_id: Optional[str] = None):
        """Создать новый документ"""
        response = self._make_request(
            'POST', f'/project/{project_id}/doc',
            user_id=user_id,
            json={'name': name, 'parent_folder_id': parent_folder_id}
        )
        return response.json()

    def create_folder(self, user_id: str, project_id: str, name: str, parent_folder_id: Optional[str] = None):
        """Создать новую папку"""
        response = self._make_request(
            'POST', f'/project/{project_id}/folder',
            user_id=user_id,
            json={'name': name, 'parent_folder_id': parent_folder_id}
        )
        return response.json()

    def rename_entity(self, user_id: str, project_id: str, entity_type: str, entity_id: str, new_name: str):
        """Переименовать файл/документ/папку"""
        self._make_request(
            'POST', f'/project/{project_id}/{entity_type}/{entity_id}/rename',
            user_id=user_id,
            json={'name': new_name}
        )

    def move_entity(self, user_id: str, project_id: str, entity_type: str, entity_id: str, target_folder_id: str):
        """Переместить файл/документ/папку"""
        self._make_request(
            'POST', f'/project/{project_id}/{entity_type}/{entity_id}/move',
            user_id=user_id,
            json={'folder_id': target_folder_id}
        )

    def delete_file(self, user_id: str, project_id: str, file_id: str):
        """Удалить файл"""
        self._make_request(
            'DELETE', f'/project/{project_id}/file/{file_id}',
            user_id=user_id
        )

    def delete_doc(self, user_id: str, project_id: str, doc_id: str):
        """Удалить документ"""
        self._make_request(
            'DELETE', f'/project/{project_id}/doc/{doc_id}',
            user_id=user_id
        )

    def delete_folder(self, user_id: str, project_id: str, folder_id: str):
        """Удалить папку"""
        self._make_request(
            'DELETE', f'/project/{project_id}/folder/{folder_id}',
            user_id=user_id
        )

    def upload_file_by_path(self, user_id: str, project_id: str, file_path: str, target_path: str):
        """Загрузить файл по пути (с сохранением истории)"""
        import os
        file_name = os.path.basename(target_path)

        with open(file_path, 'rb') as f:
            files = {'qqfile': (file_name, f)}
            data = {
                'name': file_name,
                'path': target_path
            }
            response = self._make_request(
                'POST', f'/project/{project_id}/upload-by-path',
                user_id=user_id,
                files=files,
                data=data
            )
        return response.json()

    def sync_project_from_zip(self, user_id: str, project_id: str, zip_path: str):
        """Синхронизировать проект из ZIP (с сохранением истории)"""
        with open(zip_path, 'rb') as f:
            files = {'qqfile': ('project.zip', f)}
            response = self._make_request(
                'POST', f'/project/{project_id}/sync-from-zip',
                user_id=user_id,
                files=files
            )
        return response.json()

# Использование
api = OverleafServiceAPI('http://localhost', 'overleaf', 'password')

# Создать проект от имени пользователя
user_id = '507f1f77bcf86cd799439011'
project = api.create_project(user_id, 'Service API Test')
project_id = project['project_id']

# Создать папку для изображений
folder = api.create_folder(user_id, project_id, 'images')
folder_id = folder['folder_id']

# Загрузить файл в папку
upload_result = api.upload_file(user_id, project_id, 'logo.png', folder_id)
print(f"Uploaded file: {upload_result['entity_id']}")

# Создать новый документ
doc = api.create_doc(user_id, project_id, 'chapter1.tex')
print(f"Created doc: {doc['_id']}")

# Переименовать документ
api.rename_entity(user_id, project_id, 'doc', doc['_id'], 'introduction.tex')
print("Document renamed")

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
const FormData = require('form-data');
const fs = require('fs');

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

  // === Файловые операции ===

  async uploadFile(userId, projectId, filePath, targetFolderId = null) {
    const form = new FormData();
    form.append('qqfile', fs.createReadStream(filePath));
    form.append('name', require('path').basename(filePath));

    const url = targetFolderId
      ? `/project/${projectId}/upload?folder_id=${targetFolderId}`
      : `/project/${projectId}/upload`;

    const response = await this.client.post(url, form, {
      headers: {
        'X-Overleaf-User-Id': userId,
        ...form.getHeaders()
      }
    });
    return response.data;
  }

  async createDoc(userId, projectId, name, parentFolderId = null) {
    const response = await this.client.post(`/project/${projectId}/doc`,
      { name, parent_folder_id: parentFolderId },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
    return response.data;
  }

  async createFolder(userId, projectId, name, parentFolderId = null) {
    const response = await this.client.post(`/project/${projectId}/folder`,
      { name, parent_folder_id: parentFolderId },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
    return response.data;
  }

  async renameEntity(userId, projectId, entityType, entityId, newName) {
    await this.client.post(`/project/${projectId}/${entityType}/${entityId}/rename`,
      { name: newName },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
  }

  async moveEntity(userId, projectId, entityType, entityId, targetFolderId) {
    await this.client.post(`/project/${projectId}/${entityType}/${entityId}/move`,
      { folder_id: targetFolderId },
      { headers: { 'X-Overleaf-User-Id': userId } }
    );
  }

  async deleteFile(userId, projectId, fileId) {
    await this.client.delete(`/project/${projectId}/file/${fileId}`, {
      headers: { 'X-Overleaf-User-Id': userId }
    });
  }

  async deleteDoc(userId, projectId, docId) {
    await this.client.delete(`/project/${projectId}/doc/${docId}`, {
      headers: { 'X-Overleaf-User-Id': userId }
    });
  }

  async deleteFolder(userId, projectId, folderId) {
    await this.client.delete(`/project/${projectId}/folder/${folderId}`, {
      headers: { 'X-Overleaf-User-Id': userId }
    });
  }

  async uploadFileByPath(userId, projectId, filePath, targetPath) {
    const form = new FormData();
    form.append('qqfile', fs.createReadStream(filePath));
    form.append('name', require('path').basename(targetPath));
    form.append('path', targetPath);

    const response = await this.client.post(`/project/${projectId}/upload-by-path`, form, {
      headers: {
        'X-Overleaf-User-Id': userId,
        ...form.getHeaders()
      }
    });
    return response.data;
  }

  async syncProjectFromZip(userId, projectId, zipPath) {
    const form = new FormData();
    form.append('qqfile', fs.createReadStream(zipPath));

    const response = await this.client.post(`/project/${projectId}/sync-from-zip`, form, {
      headers: {
        'X-Overleaf-User-Id': userId,
        ...form.getHeaders()
      }
    });
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

  // Создать папку для файлов
  const folder = await api.createFolder(userId, project.project_id, 'images');
  console.log('Created folder:', folder.folder_id);

  // Загрузить файл
  const uploadResult = await api.uploadFile(userId, project.project_id, './logo.png', folder.folder_id);
  console.log('Uploaded file:', uploadResult.entity_id);

  // Создать новый документ
  const doc = await api.createDoc(userId, project.project_id, 'chapter1.tex');
  console.log('Created document:', doc._id);

  // Переименовать документ
  await api.renameEntity(userId, project.project_id, 'doc', doc._id, 'introduction.tex');
  console.log('Document renamed');

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

# === Файловые операции ===

# Загрузить файл
upload_file() {
    local project_id=$1
    local file_path=$2
    local folder_id=$3
    local file_name=$(basename "$file_path")

    local url="/project/$project_id/upload"
    if [ -n "$folder_id" ]; then
        url="$url?folder_id=$folder_id"
    fi

    curl -s -u "$SERVICE_USER:$SERVICE_PASS" \
        -H "X-Overleaf-User-Id: $USER_ID" \
        -F "qqfile=@$file_path" \
        -F "name=$file_name" \
        "$OVERLEAF_URL/service$url" | jq .
}

# Создать документ
create_doc() {
    local project_id=$1
    local name=$2
    local parent_folder_id=$3

    local body="{\"name\":\"$name\""
    if [ -n "$parent_folder_id" ]; then
        body="$body,\"parent_folder_id\":\"$parent_folder_id\""
    fi
    body="$body}"

    service_request POST "/project/$project_id/doc" \
        -H "Content-Type: application/json" \
        -d "$body" | jq .
}

# Создать папку
create_folder() {
    local project_id=$1
    local name=$2
    local parent_folder_id=$3

    local body="{\"name\":\"$name\""
    if [ -n "$parent_folder_id" ]; then
        body="$body,\"parent_folder_id\":\"$parent_folder_id\""
    fi
    body="$body}"

    service_request POST "/project/$project_id/folder" \
        -H "Content-Type: application/json" \
        -d "$body" | jq .
}

# Переименовать сущность
rename_entity() {
    local project_id=$1
    local entity_type=$2
    local entity_id=$3
    local new_name=$4

    service_request POST "/project/$project_id/$entity_type/$entity_id/rename" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$new_name\"}"
}

# Удалить файл
delete_file() {
    local project_id=$1
    local file_id=$2

    service_request DELETE "/project/$project_id/file/$file_id"
}

# Удалить документ
delete_doc() {
    local project_id=$1
    local doc_id=$2

    service_request DELETE "/project/$project_id/doc/$doc_id"
}

# Пример использования
echo "Listing projects..."
list_projects

echo "Creating project..."
PROJECT_RESPONSE=$(create_project "Service API Test")
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.project_id')
echo "Created project: $PROJECT_ID"

echo "Creating folder..."
FOLDER_RESPONSE=$(create_folder "$PROJECT_ID" "images")
FOLDER_ID=$(echo "$FOLDER_RESPONSE" | jq -r '.folder_id')
echo "Created folder: $FOLDER_ID"

echo "Uploading file..."
upload_file "$PROJECT_ID" "logo.png" "$FOLDER_ID"

echo "Creating document..."
DOC_RESPONSE=$(create_doc "$PROJECT_ID" "chapter1.tex")
DOC_ID=$(echo "$DOC_RESPONSE" | jq -r '._id')
echo "Created document: $DOC_ID"

echo "Renaming document..."
rename_entity "$PROJECT_ID" "doc" "$DOC_ID" "introduction.tex"

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

## Дополнительная информация

### Связанные документы

- [API_DOCUMENTATION_RU.md](API_DOCUMENTATION_RU.md) - Полная документация Web API
- [API_QUICK_REFERENCE.md](API_QUICK_REFERENCE.md) - Краткий справочник endpoints
- [API_README.md](API_README.md) - Руководство по началу работы

