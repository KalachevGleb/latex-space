# 📦 Созданные файлы для настройки Overleaf CE

## 📖 Документация (на русском языке)

### `START_HERE_RU.txt` 
**Начните отсюда!** Краткий обзор того, что сделано и что нужно сделать.

### `README_DEV.md`
Основной файл документации. Содержит:
- Список выполненных настроек
- Пошаговую инструкцию запуска
- Структуру проекта
- Основные команды

### `QUICKSTART_RU.md`
Быстрая шпаргалка с самыми важными командами и путями.

### `SETUP_RU.md`
Полное подробное руководство (11KB). Включает:
- Детальные инструкции по установке
- Объяснение как работает live-reload
- Инструкции по отладке
- Решение типичных проблем
- Примеры типичных задач разработки
- Работа с базой данных
- Полезные ссылки

## 🛠️ Скрипты автоматизации

### `setup.sh` (исполняемый)
Автоматический скрипт настройки. Выполняет:
- ✓ Проверку всех зависимостей
- ✓ Создание .env конфигурации
- ✓ Сборку Docker образов
- ✓ Опциональную сборку TeX Live

**Использование:**
```bash
./setup.sh
```

### `check-ready.sh` (исполняемый)
Скрипт диагностики системы. Проверяет:
- ✓ Установлен ли Docker
- ✓ Запущен ли Docker
- ✓ Наличие Git
- ✓ Клонирован ли репозиторий
- ✓ Созданы ли конфигурационные файлы
- ✓ Собраны ли Docker образы
- ✓ Свободен ли порт 80

**Использование:**
```bash
./check-ready.sh
```

## ⚙️ Конфигурационные файлы

### `develop/.env`
Настройки для macOS. Содержит:
```
DOCKER_SOCKET_PATH=/var/run/docker.sock.raw
```

Необходим для корректной работы Docker на macOS при компиляции PDF.

## 📁 Структура проекта

```
/Users/gleb/Projects/overleaf/
│
├── 📄 START_HERE_RU.txt          ← НАЧНИТЕ ОТСЮДА
├── 📄 README_DEV.md              ← Основная документация
├── 📄 QUICKSTART_RU.md           ← Быстрая шпаргалка
├── 📄 SETUP_RU.md                ← Полное руководство
├── 📄 FILES_CREATED.md           ← Этот файл
│
├── 🔧 setup.sh                   ← Автоматическая настройка
├── 🔍 check-ready.sh             ← Диагностика системы
│
├── 📂 develop/                   ← Конфигурация для разработки
│   ├── .env                      ← Настройки macOS
│   ├── dev.env                   ← Переменные окружения
│   ├── docker-compose.yml        ← Основная конфигурация
│   ├── docker-compose.dev.yml    ← Dev режим с volume mounts
│   └── bin/                      ← Скрипты управления
│       ├── dev                   ← Запуск в dev режиме
│       ├── up                    ← Обычный запуск
│       ├── down                  ← Остановка
│       ├── build                 ← Сборка образов
│       ├── logs                  ← Просмотр логов
│       └── shell                 ← Shell контейнера
│
├── 📂 services/                  ← КОД OVERLEAF ЗДЕСЬ
│   ├── web/                      ← Основной сервис
│   │   ├── frontend/             ← React + TypeScript
│   │   ├── app/                  ← Node.js backend
│   │   ├── public/               ← Статика
│   │   └── ...
│   ├── clsi/                     ← LaTeX компилятор
│   ├── document-updater/         ← Обработка документов
│   ├── real-time/                ← WebSocket сервер
│   └── ...                       ← Другие микросервисы
│
└── 📂 libraries/                 ← Общие библиотеки
    ├── logger/
    ├── metrics/
    ├── settings/
    └── ...
```

## 🎯 Следующие шаги

1. **Установите Docker Desktop**
   ```bash
   brew install --cask docker
   ```
   Или скачайте с https://www.docker.com/products/docker-desktop

2. **Запустите Docker Desktop**
   - Откройте из Applications
   - Дождитесь полного запуска

3. **Проверьте готовность**
   ```bash
   ./check-ready.sh
   ```

4. **Запустите автонастройку**
   ```bash
   ./setup.sh
   ```

5. **Запустите Overleaf**
   ```bash
   cd develop
   ./bin/dev web webpack
   ```

6. **Откройте браузер**
   ```
   http://localhost/launchpad
   ```

## 💡 Ключевые особенности настройки

### ✨ Live-Reload

**Frontend (React):**
- 📁 Путь: `services/web/frontend/`
- ⚡ Hot Module Replacement
- 🔄 Изменения видны мгновенно без перезагрузки

**Backend (Node.js):**
- 📁 Путь: `services/web/app/`
- 🔄 Автоматический рестарт при изменениях
- ⏱️ Рестарт занимает 1-3 секунды

### 🐛 Отладка

Все сервисы в dev режиме открывают порты для отладки:
- **web:** `localhost:9229`
- **clsi:** `localhost:9230`
- **document-updater:** `localhost:9234`
- **real-time:** `localhost:9237`

Подключение через Chrome DevTools: `chrome://inspect`

### 🔧 Volume Mounts

Все изменения в коде сразу видны в контейнерах:
- `services/web/app/` → автоматический перезапуск
- `services/web/frontend/` → HMR
- `services/web/config/` → доступно в контейнере
- И т.д. для всех сервисов

## 📝 Полезные команды

```bash
# Из корня проекта
./check-ready.sh              # Диагностика
./setup.sh                    # Автонастройка

# Из develop/
./bin/dev                     # Dev режим (все сервисы)
./bin/dev web webpack         # Dev режим (только web + webpack)
./bin/up                      # Обычный запуск
./bin/down                    # Остановка
./bin/logs                    # Все логи
./bin/logs web                # Логи конкретного сервиса
./bin/shell web               # Shell в контейнере
./bin/build                   # Пересборка образов

# TeX Live (для PDF)
docker build texlive -t texlive-full
```

## 🆘 Помощь и поддержка

Если что-то не работает:

1. Запустите диагностику: `./check-ready.sh`
2. Проверьте логи: `cd develop && ./bin/logs`
3. Изучите `SETUP_RU.md` - там есть раздел "Устранение проблем"
4. Проверьте что Docker запущен: `docker info`

## 📚 Дополнительные ресурсы

- [Overleaf GitHub](https://github.com/overleaf/overleaf)
- [Overleaf Wiki](https://github.com/overleaf/overleaf/wiki)
- [Contributing Guide](https://github.com/overleaf/overleaf/blob/main/CONTRIBUTING.md)
- [Docker Documentation](https://docs.docker.com/)

---

**Создано:** $(date)  
**Версия Overleaf:** Community Edition  
**Настроено для:** macOS (Apple Silicon & Intel)  

