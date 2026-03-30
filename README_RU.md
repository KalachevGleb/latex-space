# LatexSpace: Independent fork of Overleaf initially created for use in Peer Review system

English version: `README_EN.md`

Независимый fork Overleaf CE, адаптированный для систем рецензирования журналов и расширенных self-hosted инсталляций.

Проект основан на архитектуре Overleaf CE, но в этой ветке добавлены собственные возможности и удалена неактуальная для этого fork логика лимитов и подписок.

## Что это за версия

- Основа: `overleaf/overleaf` (Community Edition).
- Назначение: платформа для совместной работы с LaTeX + интеграция в workflow peer-review.
- Дополнения fork:
  - Service-to-Service API (`/service/*`, Basic Auth, без браузерной сессии).
  - Расширения для review panel и comments API.
  - Управление защитой проектов/файлов и правами пользователей.
  - Улучшенная локализация (в т.ч. русский язык).

Важно: внешние ресурсы основного Overleaf репозитория полезны только как справка по базовой платформе. Для этого fork приоритетны документы в этом репозитории.

## Архитектура (кратко)

Это монорепозиторий с микросервисами:

- `services/web` - основной HTTP-сервис (UI, API, orchestration).
- `services/real-time` - WebSocket слой для коллаборации.
- `services/document-updater` - применение изменений документов (OT-пайплайн).
- `services/docstore` и `services/filestore` - хранение документов и файлов.
- `services/clsi` - компиляция LaTeX в PDF (через Docker TeX Live образ).
- `services/chat`, `services/project-history` и др. - комментарии, история, сопутствующие функции.
- `libraries/*` - общие библиотеки для сервисов.

Базовый поток редактирования:
1. Изменения от клиента идут в `real-time`.
2. `document-updater` применяет их и сохраняет в хранилище.
3. Обновления рассылаются подключенным клиентам.

## Структура репозитория

```text
.
|-- services/                    # микросервисы
|-- libraries/                   # общие библиотеки
|-- develop/                     # dev-окружение (docker compose + скрипты bin/*)
|-- server-ce/                   # сборка production-образов
|-- scripts/
|   |-- prepare_install.sh       # сборка deployment-архива
|   `-- install_overleaf.sh      # установка архива на сервер
|-- api_doc/                     # документация API fork-версии
|-- CLAUDE.md                    # инструкция для ИИ по разработке
`-- README.deployment.md         # детали процесса deployment
```

## Запуск: режим 1 (локальная разработка)

Рекомендуемый способ для разработки с hot reload.

1) Сборка образов:
```bash
cd develop
bin/build
```

2) (Опционально, но обычно нужно для компиляции) собрать TeX Live образ:
```bash
docker build texlive -t texlive-full
```

3) Запуск:
```bash
# все сервисы в dev-режиме
bin/dev

# либо минимально для UI/backend работы
bin/dev web webpack
```

4) Первый вход:
- откройте `http://localhost/launchpad`
- создайте первый админ-аккаунт

Полезные команды:
```bash
bin/down
bin/logs
bin/logs web
bin/shell web
```

Дополнительно: `SETUP_RU.md`, `README_DEV.md`, `TESTING.md`.

## Запуск: режим 2 (deployment пакет на сервер)

### На машине сборки

```bash
./scripts/prepare_install.sh
```

Скрипт собирает и упаковывает все необходимое в `overleaf-custom.tar.gz` (включая Docker-образы и runtime-конфигурацию).

### На целевом сервере

1) Подготовьте `config.json` (можно взять `overleaf_config.json.example`).

2) Выполните установку:
```bash
./scripts/install_overleaf.sh overleaf-custom.tar.gz config.json
```

После установки сервисы управляются через `docker compose` в `installDir` (из `config.json`, по умолчанию `/opt/overleaf`):

```bash
cd <installDir>
docker compose up -d
docker compose down
docker compose logs -f
```

Подробнее: `README.deployment.md`.

## Документация fork-версии

- `CLAUDE.md` - обзор кастомных фич и архитектурных деталей.
- `api_doc/API_INDEX.md` - полный индекс API-документации.
- `api_doc/SERVICE_TO_SERVICE_API.md` - ключевой документ по `/service/*`.
- `api_doc/API_DOCUMENTATION_RU.md` - расширенный справочник API.
- `claude_dev_reports/` - отчеты по ходу разработки и изменениям.
- `TESTING.md` - сценарии тестирования.

## Совместимость и безопасность

- Это независимая кодовая база, не официальный релиз Overleaf Server Pro.
- Параметры прод-эксплуатации (TLS, reverse proxy, backup, мониторинг, hardening) настраиваются отдельно под вашу инфраструктуру.
- Перед публикацией/эксплуатацией в недоверенной среде проверьте модель изоляции компиляций и контейнерные политики безопасности.

## Лицензия

Код распространяется по AGPL-3.0. См. `LICENSE`.

Исходная платформа и значительная часть кода происходят из Overleaf (c) Overleaf, 2014-2025.
