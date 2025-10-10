# 🏗️ Архитектура Overleaf CE

## 📊 Схема микросервисов

```
┌─────────────────────────────────────────────────────────────────┐
│                         ПОЛЬЗОВАТЕЛЬ                            │
│                    http://localhost:80                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEBPACK DEV SERVER                         │
│                      (Frontend assets)                          │
│                     Port: 3808 → 80                            │
│  • Hot Module Replacement                                       │
│  • Automatic rebuild on changes                                 │
│  • Source maps for debugging                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         WEB SERVICE                             │
│                        Port: 3000                               │
│  Backend:  services/web/app/         (Node.js + Express)       │
│  Frontend: services/web/frontend/    (React + TypeScript)      │
│  Views:    services/web/app/views/   (Pug templates)           │
│                                                                  │
│  Возможности:                                                    │
│  • User authentication & management                             │
│  • Project management                                           │
│  • Editor interface                                             │
│  • API endpoints                                                │
│  • Session management                                           │
└──┬───────┬────────┬────────┬────────┬────────┬─────────┬────────┘
   │       │        │        │        │        │         │
   ▼       ▼        ▼        ▼        ▼        ▼         ▼
┌──────┐ ┌────┐ ┌─────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│CLSI  │ │CHAT│ │DOC  │ │DOCUMENT│ │FILE  │ │REAL  │ │PROJECT   │
│      │ │    │ │STORE│ │UPDATER │ │STORE │ │TIME  │ │HISTORY   │
└──────┘ └────┘ └─────┘ └────────┘ └──────┘ └──────┘ └──────────┘
   │       │        │        │        │        │         │
   └───────┴────────┴────────┴────────┴────────┴─────────┘
                             │
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
   ┌─────────────┐                      ┌─────────────┐
   │   MongoDB   │                      │    Redis    │
   │  Port: 27017│                      │  Port: 6379 │
   │             │                      │             │
   │  • Projects │                      │  • Sessions │
   │  • Users    │                      │  • Cache    │
   │  • Docs     │                      │  • Queues   │
   └─────────────┘                      └─────────────┘
```

## 🔄 Микросервисы - детали

### 🌐 **Web Service** (главный сервис)
- **Порт:** 3000
- **Код:** `services/web/`
- **Отладка:** `localhost:9229`
- **Функции:**
  - HTTP сервер (Express)
  - Рендеринг UI (React + Pug)
  - REST API
  - Аутентификация пользователей
  - Управление проектами

### 📝 **Document-Updater**
- **Порт:** 3003
- **Код:** `services/document-updater/`
- **Отладка:** `localhost:9234`
- **Функции:**
  - Обработка изменений в документах
  - Operational Transform (OT)
  - Синхронизация изменений между пользователями
  - Кеширование документов в Redis

### 🔌 **Real-Time Service**
- **Порт:** 3026
- **Код:** `services/real-time/`
- **Отладка:** `localhost:9237`
- **Функции:**
  - WebSocket соединения
  - Передача изменений в реальном времени
  - Управление присутствием пользователей
  - Уведомления о курсорах

### 🛠️ **CLSI** (Common LaTeX Service Interface)
- **Порт:** 3013
- **Код:** `services/clsi/`
- **Отладка:** `localhost:9230`
- **Функции:**
  - Компиляция LaTeX документов
  - Управление Docker контейнерами для компиляции
  - Кеширование скомпилированных файлов
  - Генерация PDF

### 📦 **Docstore**
- **Порт:** 3016
- **Код:** `services/docstore/`
- **Отладка:** `localhost:9233`
- **Функции:**
  - Хранение документов и файлов
  - Версионирование документов
  - Архивация/разархивация

### 💬 **Chat Service**
- **Порт:** 3010
- **Код:** `services/chat/`
- **Отладка:** `localhost:9231`
- **Функции:**
  - Комментарии к проектам
  - Чат в проектах
  - История сообщений

### 📁 **Filestore**
- **Порт:** 3009
- **Код:** `services/filestore/`
- **Отладка:** `localhost:9235`
- **Функции:**
  - Хранение загруженных файлов
  - Загрузка изображений
  - Управление шаблонами

### 📜 **Project-History**
- **Порт:** 3054
- **Код:** `services/project-history/`
- **Отладка:** `localhost:9240`
- **Функции:**
  - История изменений проекта
  - Track changes
  - Восстановление версий

### 👥 **Contacts Service**
- **Порт:** 3036
- **Код:** `services/contacts/`
- **Отладка:** `localhost:9232`
- **Функции:**
  - Управление контактами пользователей
  - Автозаполнение при шаринге

### 🔔 **Notifications Service**
- **Порт:** 3042
- **Код:** `services/notifications/`
- **Отладка:** `localhost:9236`
- **Функции:**
  - Уведомления пользователей
  - Email уведомления
  - Push уведомления

## 🔄 Workflow изменений в документе

```
┌─────────────┐
│ Пользователь│
│ печатает    │
└──────┬──────┘
       │ keystroke
       ▼
┌─────────────────────────────┐
│   Browser (React Editor)    │
│  • Capture keystrokes       │
│  • Create operation (OT)    │
└──────┬──────────────────────┘
       │ WebSocket
       ▼
┌─────────────────────────────┐
│     Real-Time Service       │
│  • Receive operation        │
│  • Broadcast to other users │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Document-Updater          │
│  • Apply OT transformation  │
│  • Update document in Redis │
│  • Queue for persistence    │
└──────┬──────────────────────┘
       │
       ├─────────────┬─────────────┐
       ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ Docstore │  │ Project  │  │ Other users  │
│ (MongoDB)│  │ History  │  │ (via WS)     │
└──────────┘  └──────────┘  └──────────────┘
```

## 🔄 Workflow компиляции PDF

```
┌─────────────┐
│ Пользователь│
│ нажимает    │
│ "Recompile" │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│      Web Service            │
│  • API request /compile     │
└──────┬──────────────────────┘
       │ HTTP POST
       ▼
┌─────────────────────────────┐
│      CLSI Service           │
│  • Receive compile request  │
│  • Fetch project files      │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│   Docker (TeX Live)         │
│  • Create container         │
│  • Run pdflatex/xelatex     │
│  • Compile LaTeX → PDF      │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│      CLSI Service           │
│  • Cache compiled PDF       │
│  • Return PDF URL           │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│      Browser                │
│  • Display PDF in viewer    │
└─────────────────────────────┘
```

## 💾 Хранилища данных

### MongoDB (Port 27017)
```
Коллекции:
  • users          - Пользователи
  • projects       - Проекты
  • docs           - Документы
  • projectHistory - История
  • folders        - Папки
```

### Redis (Port 6379)
```
Использование:
  • Сессии пользователей
  • Кеш документов (hot documents)
  • Pub/Sub для real-time
  • Очереди задач
  • Rate limiting
```

## 🔧 Development Mode - как работает

### Volume Mounts (docker-compose.dev.yml)
```yaml
web:
  volumes:
    - ../services/web/app:/overleaf/services/web/app
    - ../services/web/frontend:/overleaf/services/web/frontend
    - ../services/web/config:/overleaf/services/web/config
```

**Что это значит:**
- Файлы с вашего компьютера доступны внутри контейнера
- Изменения видны мгновенно
- Не нужно пересобирать Docker образ

### Node.js --watch
```yaml
command: ["node", "--watch", "app.mjs"]
```

**Что происходит:**
1. Node.js следит за изменениями файлов
2. При изменении - автоматический рестарт процесса
3. Новый код сразу работает (1-3 сек)

### Webpack Dev Server
```yaml
command: ["npx", "webpack", "serve", "--config", "webpack.config.dev-env.js"]
```

**Возможности:**
1. Hot Module Replacement (HMR)
2. Изменения React компонентов без перезагрузки
3. Source maps для отладки
4. Быстрая пересборка (incremental)

## 📡 Порты и эндпоинты

### Внешние порты (доступны с хоста)
```
localhost:80      → Webpack Dev Server (main UI)
localhost:27017   → MongoDB (для GUI клиентов)
localhost:6379    → Redis (для redis-cli)
localhost:9229-9240 → Debug ports для каждого сервиса
```

### Внутренние порты (между контейнерами)
```
web:3000
clsi:3013
chat:3010
contacts:3036
docstore:3016
document-updater:3003
filestore:3009
history-v1:3100
notifications:3042
project-history:3054
real-time:3026
```

## 🛠️ Отладка - полная схема

```
┌──────────────────────────────────────────────────┐
│           Chrome Browser                         │
│  http://localhost/                               │
│  chrome://inspect/                               │
└───┬──────────────────────────────────────────┬───┘
    │                                          │
    │ WebSocket                                │ Inspector Protocol
    │ (Real-time updates)                      │ (Debug)
    │                                          │
    ▼                                          ▼
┌─────────────────┐                    ┌─────────────────┐
│  Real-Time      │                    │  Web Service    │
│  Port: 3026     │                    │  Debug: 9229    │
│  WS: /socket.io │                    │  Source maps: ✓ │
└─────────────────┘                    └─────────────────┘
```

**Как отлаживать:**

1. **Frontend (React):**
   - Chrome DevTools (F12)
   - React DevTools Extension
   - Source maps автоматически
   
2. **Backend (Node.js):**
   - `chrome://inspect` → Configure → `localhost:9229`
   - Ставьте breakpoints в исходном коде
   - Inspect появившийся Target

## 📂 Где что лежит

### Frontend
```
services/web/frontend/
├── js/
│   ├── features/          ← React компоненты (по фичам)
│   ├── infrastructure/    ← Роутинг, state management
│   ├── shared/            ← Общие компоненты
│   └── main.tsx           ← Entry point
├── stylesheets/           ← LESS стили
└── public/                ← Статические файлы
```

### Backend
```
services/web/app/
├── src/
│   ├── Features/          ← Бизнес-логика (по фичам)
│   │   ├── User/
│   │   ├── Project/
│   │   ├── Compile/
│   │   └── ...
│   ├── infrastructure/    ← Общая инфраструктура
│   └── router.mjs         ← Express routes
└── views/                 ← Pug templates (server-side)
```

## 🎯 Типичные кейсы разработки

### 1. Добавить новую страницу
```
1. Backend route:  services/web/app/src/router.mjs
2. Controller:     services/web/app/src/Features/YourFeature/
3. Frontend page:  services/web/frontend/js/features/your-feature/
4. Styles:         services/web/frontend/stylesheets/
```

### 2. Изменить UI существующей страницы
```
1. Найти компонент: services/web/frontend/js/features/
2. Изменить .tsx файл
3. Сохранить
4. HMR применит изменения автоматически (без перезагрузки!)
```

### 3. Добавить API endpoint
```
1. Route:          services/web/app/src/router.mjs
2. Controller:     services/web/app/src/Features/YourFeature/YourController.js
3. Middleware:     (если нужно) services/web/app/src/Features/Authentication/
4. Тесты:          services/web/test/
```

### 4. Изменить логику компиляции
```
1. Backend:        services/clsi/app/js/
2. Конфиг:         services/clsi/config/
3. Рестарт:        ./bin/dev clsi
```

## 🚀 Production vs Development

### Production (server-ce/)
- Все сервисы в одном контейнере
- Nginx frontend
- Минифицированные assets
- Без source maps
- Без hot reload

### Development (develop/)
- Каждый сервис в отдельном контейнере
- Webpack Dev Server
- Source maps
- Hot Module Replacement
- Node.js --watch
- Debug ports открыты

---

**Эта схема поможет вам понять как Overleaf работает изнутри и где искать нужный код!** 🎉

