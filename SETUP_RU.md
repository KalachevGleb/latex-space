# Настройка Overleaf CE для разработки

Это руководство поможет вам настроить локальную среду разработки Overleaf Community Edition с возможностью live-редактирования кода.

## Требования

1. **Docker Desktop** для macOS
   - Скачать: https://www.docker.com/products/docker-desktop
   - Или установить через Homebrew: `brew install --cask docker`
   - После установки запустите Docker Desktop

2. **Git** (уже установлен)
3. **Homebrew** (уже установлен)

## Быстрый старт

### 1. Установите Docker Desktop

Если Docker еще не установлен:
```bash
brew install --cask docker
```

После установки:
1. Откройте Docker Desktop из папки Applications
2. Дождитесь запуска Docker (иконка в меню сверху станет стабильной)
3. Проверьте установку: `docker --version`

### 2. Соберите Docker образы

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/build
```

Это займет 15-30 минут в зависимости от скорости интернета и мощности компьютера.

### 3. Соберите TeX Live образ (для компиляции PDF)

```bash
cd /Users/gleb/Projects/overleaf/develop
docker build texlive -t texlive-full
```

Это может занять значительное время (~1-2 часа), так как TeX Live очень большой.

### 4. Запустите Overleaf в режиме разработки

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/dev
```

Эта команда запустит все сервисы с автоматической перезагрузкой при изменении кода.

### 5. Создайте первый аккаунт администратора

Откройте в браузере: http://localhost/launchpad

## Режимы работы

### Обычный режим (без автоперезагрузки)

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/up
```

Для остановки:
```bash
./bin/down
```

### Режим разработки (с автоперезагрузкой)

Запуск всех сервисов:
```bash
./bin/dev
```

Запуск только определенных сервисов (рекомендуется для производительности):
```bash
./bin/dev web webpack
```

Это запустит только backend сервис `web` и frontend `webpack` в режиме разработки. Остальные сервисы запустятся в обычном режиме.

### Просмотр логов

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/logs
```

Для конкретного сервиса:
```bash
./bin/logs web
```

### Доступ к shell контейнера

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/shell web
```

## Структура проекта

```
/Users/gleb/Projects/overleaf/
├── services/                      # Микросервисы Overleaf
│   ├── web/                       # Основной веб-сервис (frontend + backend)
│   │   ├── app/                   # Backend код (Node.js)
│   │   ├── frontend/              # Frontend код (React)
│   │   ├── public/                # Статические файлы
│   │   └── ...
│   ├── clsi/                      # LaTeX компилятор
│   ├── document-updater/          # Обработка изменений документов
│   ├── real-time/                 # WebSocket для реального времени
│   └── ...                        # Другие сервисы
├── libraries/                     # Общие библиотеки
├── develop/                       # Конфигурация для разработки
│   ├── bin/                       # Скрипты управления
│   ├── docker-compose.yml         # Основная конфигурация
│   ├── docker-compose.dev.yml     # Конфигурация для dev режима
│   ├── dev.env                    # Переменные окружения
│   └── .env                       # Локальные настройки (для macOS)
└── server-ce/                     # Production образ
```

## Как работает live-reload

### Backend (Node.js)

Используется флаг `--watch` в Node.js, который автоматически перезапускает процесс при изменении файлов:
- Файлы монтируются через Docker volumes (см. `docker-compose.dev.yml`)
- При изменении `.js`, `.mjs` или `.ts` файла сервис автоматически перезапускается
- Изменения видны сразу после перезапуска

### Frontend (React/Webpack)

Webpack Dev Server с Hot Module Replacement:
- Работает на порту 3808 внутри контейнера, проксируется на localhost:80
- Изменения в React компонентах применяются без перезагрузки страницы
- Изменения в стилях применяются мгновенно

## Отладка (Debugging)

Когда сервисы запущены в режиме разработки, они открывают порты для удаленной отладки:

| Сервис            | Порт для отладки |
|-------------------|------------------|
| web               | 9229             |
| clsi              | 9230             |
| chat              | 9231             |
| contacts          | 9232             |
| docstore          | 9233             |
| document-updater  | 9234             |
| filestore         | 9235             |
| notifications     | 9236             |
| real-time         | 9237             |
| history-v1        | 9239             |
| project-history   | 9240             |

### Отладка в Chrome DevTools

1. Откройте в Chrome: `chrome://inspect`
2. Нажмите "Configure..." и добавьте `localhost:9229` (или другой порт)
3. Сервис появится в списке Remote Targets
4. Нажмите "Inspect" для запуска отладчика

### Отладка в VS Code / Cursor

Создайте `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Web",
      "address": "localhost",
      "port": 9229,
      "localRoot": "${workspaceFolder}/services/web",
      "remoteRoot": "/overleaf/services/web",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Типичные задачи разработки

### Изменение кода backend (web service)

1. Откройте файл в `services/web/app/`
2. Внесите изменения
3. Сохраните файл
4. Сервис автоматически перезапустится (увидите в логах)
5. Обновите страницу в браузере

### Изменение кода frontend (React)

1. Откройте файл в `services/web/frontend/`
2. Внесите изменения
3. Сохраните файл
4. Webpack пересоберет код автоматически
5. Изменения появятся в браузере без перезагрузки

### Добавление нового npm пакета

Для backend:
```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/shell web
# Внутри контейнера:
npm install --save package-name
exit
# Перезапустите контейнер:
./bin/dev web
```

Для frontend (тот же процесс, пакеты устанавливаются в services/web)

### Добавление новой страницы/роута

1. Создайте контроллер в `services/web/app/src/Features/YourFeature/`
2. Добавьте роут в `services/web/app/src/router.mjs`
3. Создайте view в `services/web/app/views/`
4. Создайте React компонент в `services/web/frontend/js/features/`

## База данных

### MongoDB

- Доступ: `localhost:27017`
- База данных: `sharelatex`
- Подключение: `mongodb://localhost:27017/sharelatex?directConnection=true`

### Redis

- Доступ: `localhost:6379`
- Используется для кеширования и очередей

## Устранение проблем

### Docker не запускается

```bash
# Проверьте статус Docker
docker info
# Перезапустите Docker Desktop через GUI
```

### Порт 80 уже занят

Измените порт в `develop/docker-compose.yml`:
```yaml
webpack:
  ports:
    - "127.0.0.1:8080:3808"  # вместо 80:3808
```

### Сервисы не перезапускаются при изменениях

1. Убедитесь, что используете `./bin/dev`, а не `./bin/up`
2. Проверьте, что изменяете файлы в правильной директории
3. Проверьте логи: `./bin/logs web`

### Не компилируется PDF

1. Убедитесь, что собрали TeX Live образ:
   ```bash
   docker build texlive -t texlive-full
   ```
2. Проверьте настройки в `develop/.env`:
   ```
   DOCKER_SOCKET_PATH=/var/run/docker.sock.raw
   ```

### Ошибка при сборке образов: "pprof" failed to compile

**Симптомы:** Ошибка `npm error node-pre-gyp ERR!` при сборке образов, упоминание `pprof`.

**Причина:** Пакет `pprof` (профилирование Google Cloud) требует компиляции нативных модулей и несовместим с новыми версиями Node.js.

**Решение:** Уже исправлено! В Dockerfile'ах добавлен флаг `--no-optional`, который пропускает проблемные зависимости. Если проблема все еще есть, проверьте что в `services/*/Dockerfile` есть:
```dockerfile
RUN cd /overleaf && npm ci --quiet --no-optional || npm ci --quiet --legacy-peer-deps
```

**Примечание:** Предупреждения `Error: Patch file found for package...` - это нормально, игнорируйте их.

### Docker выдает ошибку нехватки памяти при сборке

Создайте/измените `develop/.env`:
```
COMPOSE_PARALLEL_LIMIT=1
```

Это замедлит сборку, но уменьшит потребление памяти.

### Закончилось место на диске

Docker может занимать много места (~40-50GB после сборки всех образов).

**Проверить использование:**
```bash
docker system df
```

**Почистить неиспользуемые данные:**
```bash
# Осторожно! Удалит ВСЕ неиспользуемые образы, контейнеры и volumes
docker system prune -a --volumes -f
```

**Почистить только build cache (безопаснее):**
```bash
docker builder prune -a -f
```

**После чистки** нужно пересобрать образы: `./bin/build`

## Полезные команды

```bash
# Пересобрать все образы
./bin/build

# Пересобрать конкретный сервис
docker-compose build web

# Удалить все контейнеры и volumes (чистая установка)
./bin/down
docker system prune -a --volumes

# Просмотр запущенных контейнеров
docker-compose ps

# Выполнить команду в контейнере
docker-compose exec web npm test
```

## Следующие шаги

После успешного запуска вы можете:
1. Изучить структуру кода в `services/web/`
2. Просмотреть документацию: https://github.com/overleaf/overleaf/wiki
3. Начать добавлять свои фичи!

## Полезные ссылки

- [Overleaf GitHub](https://github.com/overleaf/overleaf)
- [Overleaf Wiki](https://github.com/overleaf/overleaf/wiki)
- [Contributing Guide](https://github.com/overleaf/overleaf/blob/main/CONTRIBUTING.md)
- [Docker Documentation](https://docs.docker.com/)

