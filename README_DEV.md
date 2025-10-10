# Overleaf CE - Локальная разработка

Эта папка содержит полностью настроенное окружение для разработки Overleaf Community Edition с live-reload.

## 📋 Что уже настроено

✅ Репозиторий Overleaf клонирован  
✅ Docker Compose конфигурация для разработки  
✅ Volume mounts для автоматической перезагрузки кода  
✅ Конфигурация для macOS (.env)  
✅ Все микросервисы готовы к сборке  
✅ Скрипты автоматизации (setup.sh)  

## 🚀 Что нужно сделать вам

### 1. Установить Docker Desktop

Docker Desktop еще не установлен. Выберите один из способов:

**Вариант А: Через браузер (рекомендуется)**
1. Перейдите на https://www.docker.com/products/docker-desktop
2. Скачайте Docker Desktop for Mac
3. Откройте `.dmg` файл и перетащите Docker в Applications
4. Запустите Docker Desktop из Applications
5. Дождитесь полного запуска (иконка в меню сверху станет стабильной)

**Вариант Б: Через Homebrew**
```bash
brew install --cask docker
```
После установки:
- Откройте Docker Desktop из Applications
- Дождитесь запуска Docker

**Проверка установки:**
```bash
docker --version
docker-compose --version
```

### 2. Запустить автоматическую настройку

После установки и запуска Docker:

```bash
cd /Users/gleb/Projects/overleaf
./setup.sh
```

Скрипт:
- Проверит все зависимости
- Соберет Docker образы (15-30 минут)
- Опционально соберет TeX Live (1-2 часа, можно пропустить)

### 3. Запустить Overleaf

```bash
cd /Users/gleb/Projects/overleaf/develop
./bin/dev
```

Или только основные сервисы (быстрее):
```bash
./bin/dev web webpack
```

### 4. Открыть в браузере

http://localhost/launchpad

Создайте первый аккаунт администратора.

---

## 📚 Документация

- **[QUICKSTART_RU.md](QUICKSTART_RU.md)** - краткая шпаргалка с основными командами
- **[SETUP_RU.md](SETUP_RU.md)** - подробное руководство со всеми деталями

---

## 🛠️ Структура для разработки

```
/Users/gleb/Projects/overleaf/
│
├── QUICKSTART_RU.md          ← Краткая шпаргалка
├── SETUP_RU.md               ← Подробное руководство
├── README_DEV.md             ← Этот файл
├── setup.sh                  ← Автоматическая настройка
│
├── services/                 ← КОД ЗДЕСЬ! 
│   ├── web/                  ← Основной сервис
│   │   ├── frontend/         ← React (изменения live)
│   │   ├── app/              ← Node.js (авто-рестарт)
│   │   └── ...
│   ├── clsi/                 ← LaTeX компилятор
│   ├── document-updater/     ← Обработка документов
│   ├── real-time/            ← WebSocket
│   └── ...
│
├── develop/                  ← Конфигурация dev окружения
│   ├── bin/
│   │   ├── dev               ← Запуск в dev режиме
│   │   ├── up                ← Обычный запуск
│   │   ├── down              ← Остановка
│   │   ├── build             ← Сборка образов
│   │   ├── logs              ← Просмотр логов
│   │   └── shell             ← Доступ к контейнеру
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── dev.env
│   └── .env                  ← Создан для macOS
│
└── libraries/                ← Общие библиотеки
```

---

## 🎯 Быстрые команды

Все команды запускаются из `develop/`:

```bash
cd /Users/gleb/Projects/overleaf/develop

# Разработка (с live-reload)
./bin/dev                    # все сервисы
./bin/dev web webpack        # только web + webpack (рекомендуется)

# Обычный запуск
./bin/up

# Остановка
./bin/down

# Логи
./bin/logs
./bin/logs web

# Shell контейнера
./bin/shell web

# Пересборка
./bin/build
```

---

## 🔥 Live-Reload

### Frontend (React)
- **Путь:** `services/web/frontend/`
- **Hot Module Replacement:** Да
- **Перезагрузка браузера:** Не нужна!
- **Скорость:** Мгновенно

### Backend (Node.js)
- **Путь:** `services/web/app/`
- **Auto-restart:** Да (флаг --watch)
- **Перезагрузка браузера:** Нужна
- **Скорость:** 1-3 секунды

---

## 🐛 Отладка

Когда сервисы в dev режиме, доступны порты для отладки:

```
web              → localhost:9229
clsi             → localhost:9230
document-updater → localhost:9234
real-time        → localhost:9237
```

**Chrome DevTools:**
1. Откройте `chrome://inspect`
2. Configure → добавьте `localhost:9229`
3. Inspect нужный сервис

---

## ❓ Нужна помощь?

1. Проверьте Docker запущен: `docker info`
2. Проверьте логи: `./bin/logs`
3. Полная документация: [SETUP_RU.md](SETUP_RU.md)

---

## 🎉 Следующие шаги

После успешного запуска:
1. Изучите код в `services/web/`
2. Попробуйте изменить что-то в UI
3. Посмотрите на live-reload в действии
4. Начинайте добавлять фичи!

**Удачи с разработкой! 🚀**

