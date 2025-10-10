# 🚀 Быстрый старт Overleaf CE

## Минимальные шаги для запуска

### 1. Установите Docker Desktop

Если еще не установлен:
```bash
brew install --cask docker
```

**Обязательно запустите Docker Desktop из Applications!**

### 2. Запустите автоматическую настройку

```bash
cd /Users/gleb/Projects/overleaf
./setup.sh
```

Скрипт автоматически:
- Проверит все зависимости
- Создаст необходимые конфигурации
- Соберет Docker образы
- Предложит собрать TeX Live (можно пропустить)

### 3. Запустите Overleaf

```bash
cd develop
./bin/dev
```

Для запуска только web + webpack (рекомендуется):
```bash
./bin/dev web webpack
```

### 4. Откройте в браузере

http://localhost/launchpad

Создайте первый аккаунт администратора.

---

## Основные команды

```bash
cd /Users/gleb/Projects/overleaf/develop

# Запуск в режиме разработки (с автоперезагрузкой)
./bin/dev                # все сервисы
./bin/dev web webpack    # только web + webpack

# Запуск в обычном режиме
./bin/up

# Остановка
./bin/down

# Просмотр логов
./bin/logs
./bin/logs web           # логи конкретного сервиса

# Доступ к shell контейнера
./bin/shell web

# Пересборка
./bin/build
```

---

## Где править код?

### Frontend (React, UI)
📁 `services/web/frontend/`

**Изменения применяются автоматически без перезагрузки браузера!**

### Backend (Node.js, API)
📁 `services/web/app/`

**Сервис автоматически перезапускается при изменениях.**

### Стили
📁 `services/web/frontend/stylesheets/`

### Компилятор LaTeX
📁 `services/clsi/`

---

## Отладка

Порты для подключения отладчика:

| Сервис | Порт |
|--------|------|
| web    | 9229 |
| clsi   | 9230 |

Chrome DevTools: `chrome://inspect` → Configure → добавьте `localhost:9229`

---

## Полная документация

📖 [SETUP_RU.md](SETUP_RU.md) - подробное руководство с примерами

---

## Устранение проблем

### Docker не найден
```bash
# Установите Docker Desktop
brew install --cask docker
# Запустите Docker Desktop из Applications
```

### Порт 80 занят
Измените порт в `develop/docker-compose.yml`:
```yaml
webpack:
  ports:
    - "127.0.0.1:8080:3808"  # было 80:3808
```
Затем откройте: http://localhost:8080/launchpad

### Не хватает памяти при сборке
Создайте `develop/.env`:
```
DOCKER_SOCKET_PATH=/var/run/docker.sock.raw
COMPOSE_PARALLEL_LIMIT=1
```

### PDF не компилируется
Соберите TeX Live образ:
```bash
cd develop
docker build texlive -t texlive-full
```

---

## Что дальше?

1. ✅ Запустите Overleaf
2. ✅ Создайте тестовый проект
3. ✅ Попробуйте изменить что-то во frontend и посмотрите на live-reload
4. ✅ Изучите структуру кода в `services/web/`
5. ✅ Начинайте добавлять свои фичи!

Удачи! 🎉

