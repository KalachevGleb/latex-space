# Система развертывания Overleaf Custom Edition

Эта система позволяет упаковать кастомную версию Overleaf в один архив и развернуть на целевом сервере одной командой.

## Структура

```
scripts/
├── prepare_install.sh      # Подготовка пакета для установки
└── install_overleaf.sh     # Установка на целевом сервере

overleaf_config.json.example # Пример конфигурации
DEPLOYMENT.md                # Подробная документация
```

## Процесс развертывания

### Шаг 1: Подготовка (на машине разработки)

```bash
./scripts/prepare_install.sh
```

**Что происходит:**
- Собираются Docker-образы (base, main, texlive, mongo, redis)
- Образы сохраняются в tar-файлы
- Создается docker-compose.yml для production
- Создается MongoDB init скрипт
- Все упаковывается в overleaf-custom.tar.gz (~5-8 GB)

### Шаг 2: Установка (на целевом сервере)

```bash
./scripts/install_overleaf.sh overleaf-custom.tar.gz config.json
```

*Примечание: sudo нужен только для системных директорий (`/opt`, `/srv`). Для домашних директорий sudo не требуется.*

**Что происходит:**
- Проверка Docker и Docker Compose
- Распаковка архива в указанную директорию (из config.json: installDir)
- Загрузка Docker-образов
- Создание директорий для данных
- Генерация .env файла из конфигурации
- Запуск сервисов

### Шаг 3: Первый запуск

Откройте `http://your-server/launchpad` и создайте администратора.

## Конфигурация

Минимальная конфигурация (overleaf_config.json):

```json
{
  "siteUrl": "http://localhost",
  "appName": "Overleaf",
  "adminEmail": "admin@example.com",
  "installDir": "/home/user/overleaf"
}
```

**Важные параметры:**
- `installDir` - путь установки приложения (по умолчанию `/opt/overleaf`)
- `port` - внешний порт (по умолчанию 80, можно использовать 3000, 8080, etc)

Полная конфигурация смотрите в [overleaf_config.json.example](overleaf_config.json.example)

## Требования

**Машина разработки:**
- Docker
- Make
- 20+ GB свободного места для сборки

**Целевой сервер:**
- Ubuntu 20.04+ (или любой Linux с Docker)
- Docker 20.10+
- Docker Compose 2.0+
- 8+ GB RAM
- 50+ GB свободного места
- jq (для парсинга JSON)

## Документация

- [DEPLOYMENT.md](DEPLOYMENT.md) - Полная документация по развертыванию
- [TESTING.md](TESTING.md) - Тестирование развертывания локально
- [CLAUDE.md](CLAUDE.md) - Документация для разработки

## Управление установкой

После установки Overleaf устанавливается в директорию из `installDir` (по умолчанию `/opt/overleaf`):

```bash
cd <installDir>  # ваш путь из config.json

# Управление
docker compose up -d      # Запуск
docker compose down       # Остановка
docker compose restart    # Перезапуск
docker compose logs -f    # Логи

# Файлы
.env                      # Переменные окружения
docker-compose.yml        # Docker Compose конфигурация
overleaf_config.json      # Исходная конфигурация
data/                     # Данные (MongoDB, Redis, файлы проектов)
```

## Особенности

1. **Sandboxed Compiles**: Используется отдельный Docker-образ texlive-full для компиляции LaTeX
2. **Все в одном архиве**: Один tar.gz содержит все необходимые образы и конфигурацию
3. **Простая конфигурация**: JSON вместо множества переменных окружения
4. **Безопасность**: Автоматическая генерация session secret, если не указан

## Примеры использования

### С кастомным портом и HTTPS

```json
{
  "siteUrl": "https://overleaf.example.com",
  "port": 443,
  "security": {
    "secureCookie": true
  }
}
```

### С настройкой почты (Gmail)

```json
{
  "email": {
    "fromAddress": "noreply@example.com",
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    }
  }
}
```

### С кастомным логотипом

```json
{
  "customization": {
    "navTitle": "Company LaTeX",
    "headerImageUrl": "https://example.com/logo.png"
  }
}
```

## Обновление

**Обычное обновление (изменился только код приложения) — см. [ОБНОВЛЕНИЕ.md](ОБНОВЛЕНИЕ.md).**
Это быстрый путь: `scripts/prepare_fix.sh` → `install_fix.sh` на сервере. Конфигурация
и данные не затрагиваются, резервная копия делается автоматически, есть откат.

Полная переустановка через `install_overleaf.sh` нужна только если изменились
зависимости (`package.json`) или Docker-образы mongo/redis/texlive. Она **перегенерирует
`.env` из `overleaf_config.json`** — перед этим убедитесь, что в конфиге актуальные
`siteUrl` и `security.sessionSecret`, иначе сломаются ссылки и разлогинятся все пользователи.

Резервное копирование: [scripts/backup/BACKUP_RU.md](scripts/backup/BACKUP_RU.md).
