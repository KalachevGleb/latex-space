# Автоматические тесты кода

Этот документ — про модульные / компонентные тесты кода (логика приложения).
Тестирование **развёртывания** (установка пакета, Docker, сеть) описано отдельно
в `TESTING.md`.

> Требование к окружению: тесты на Vitest требуют **Node ≥ 20.19** (Vitest 3 / Vite 7).
> В стандартном dev-окружении проекта (Docker, см. `develop/`) это уже соблюдено.

## Какие наборы тестов есть и как запускать

Все команды запускаются из каталога соответствующего сервиса (или внутри контейнера
через `cd develop && bin/shell web`).

### web (главный сервис)

```bash
cd services/web

npm run test:unit:esm     # backend unit-тесты на ESM-модули (.mjs) — Vitest
npm run test:unit:app     # backend unit-тесты (.js) — Mocha
npm run test:frontend     # frontend unit-тесты (.ts/.tsx, jsdom) — Mocha
npm run cypress:run-ct    # frontend компонентные тесты (реальный UI) — Cypress

# запустить подмножество по имени:
MOCHA_GREP="ServiceAuth" npm run test:unit:app
```

### web — приёмочные (acceptance) тесты

Поднимают web в одном процессе с тестом + реальные Mongo/Redis, а остальные
сервисы (docstore, document-updater, chat, …) подменяются заглушками. Поэтому
сквозь весь стек реально проверяются права доступа, проекты, коллабораторы и
треды-комментарии (реальная Mongo). Запускать в dev-окружении (Docker):

```bash
cd services/web
npm run test:acceptance:app
MOCHA_GREP="Service-to-Service API" npm run test:acceptance:app   # только этот набор
```

### Полный сквозной (E2E) тест — браузер на живом стеке

`server-ce/test` запускает **весь стек в Docker** (web + document-updater +
docstore + chat + real-time + Mongo/Redis) и гоняет браузерные Cypress-тесты.
Только здесь реально проверяются редактирование текста, tracked changes и
позиции комментариев сквозь живые сервисы. Запуск (macOS+Docker):

```bash
cd server-ce/test
npm run cypress:run     # headless
npm run cypress:open    # интерактивно
```

### document-updater и другие сервисы

```bash
cd services/document-updater
npm run test:unit
npm run test:unit -- --grep="DiffCodec"
```

## Что покрыто для кастомных фич этого форка

Раньше у кастомного функционала тестов не было вообще. Добавлены:

**Backend (web, Vitest — `services/web/test/unit/src/`)**
- `Authentication/ServiceAuthMiddleware.test.mjs` — аутентификация Service-to-Service API
  (вкл/выкл, ограничение по localhost, bcrypt, миграция пароля, поиск пользователя).
- `Project/ProjectProtectionHandler.test.mjs`, `ProjectProtectionController.test.mjs` — защита
  проектов и файлов от изменения/удаления.
- `User/UserPermissionsHandler.test.mjs`, `UserPermissionsController.test.mjs` — права `basic`/`full`.
- `User/UserInviteController.test.mjs` — приглашение пользователей (режим рецензирования).
- `SystemSettings/SystemSettingsManager.test.mjs`, `SystemSettingsMiddleware.test.mjs` — системные
  настройки и контроль регистрации.
- `ServerAdmin/ServiceApiController.test.mjs` — админ-настройки Service API.
- `Comments/CommentsController.test.mjs` — расширенный Comments API (треды, сообщения, позиции).
- `Comments/RangesController.test.mjs` — `/project/:id/ranges`: отдаёт диапазоны **всех** документов,
  обогащённые статусом resolved (серверная сторона бага «обзор только текущий файл»).
- `Comments/TrackChangesController.test.mjs` — вкл/выкл track changes и приём изменений (accept).

**Backend acceptance (web, Mocha — `services/web/test/acceptance/src/`)**
- `ServiceApiPermissionsTests.mjs` — Service-to-Service API (`/service/*`): аутентификация
  (нет/неверные креды, выключенный API, создание проекта от имени `X-Overleaf-User-Id`) и
  **матрица прав**: для каждой роли (owner / editor / reviewer / readOnly / посторонний)
  «тыкаем» в каждый review/comment-эндпоинт и проверяем, что срабатывают только разрешённые;
  плюс жизненный цикл комментария (создать → ответить → resolve → reopen → редактировать →
  удалить) разными пользователями.

**Полный E2E (server-ce, Cypress в браузере — `server-ce/test/`)**
- `review-comments-track-changes.spec.ts` — на живом стеке: добавление комментария
  и его появление в панели; resolve → попадание в меню «Resolved» с кнопкой re-open →
  reopen → видимость во вкладке «Обзор»; ответ коллаборатора на комментарий; tracked change
  в режиме Reviewing и его принятие; read-only доступ у viewer. (Первый драфт — гонять на
  Mac+Docker, селекторы/тайминги могут потребовать мелкой правки на первом прогоне.)

**Backend (document-updater, Mocha)**
- `test/unit/js/DiffCodec/DiffCodecHistoryOTTests.js` — построение диффов в режиме исправлений
  (tracked insert / delete / **replace**) — `diffAsHistoryOTTrackedOperation`.

**Frontend (web, Mocha — `services/web/test/frontend/`)**
- `features/review-panel/utils/can-aggregate.test.ts` — объединение diff-ов (вставка+удаление).
- `features/review-panel/utils/has-active-range.test.ts` — учёт resolved-комментариев.
- `features/review-panel/utils/resolved-comments.test.ts` — выбор resolved-тредов для меню «resolved».
- `features/review-panel/utils/build-ranges-for-docs.test.ts` — какие комментарии показывать
  для каких файлов во вкладке «Обзор».
- `utils/operations.test.ts` — базовые type-guards операций.

**Frontend компонентный (Cypress — `services/web/test/frontend/`)**
- `features/review-panel/review-panel-overview-multifile.spec.tsx` — комментарии из **других** файлов
  видны во вкладке «Обзор» и в меню «resolved» (запускать через `npm run cypress:run-ct`).

## Баг «в Обзоре / в resolved видны только комментарии текущего файла»

Статус и порядок диагностики (часть проверок требует запущенного приложения — Docker):

1. Комментарий хранится в двух местах: **текст и статус «решён»** — в общей коллекции на весь
   проект (эндпоинт `/project/:id/threads`), а **привязка к файлу и позиции** («range») — внутри
   самого документа (эндпоинт `/project/:id/ranges`). Интерфейс сшивает их вместе.
2. **Меню «resolved»**: уже исправлено — оно игнорировало «живой» открытый документ и потому
   часто было пустым; теперь открытый документ учитывается.
3. **Вкладка «Обзор»**: чтобы понять, где причина, запусти компонентный тест
   `review-panel-overview-multifile.spec.tsx` (`npm run cypress:run-ct`):
   - тест **падает** → причина во фронтенде (чинить в коде);
   - тест **проходит** → фронтенд исправен, значит привязки комментариев не доходят до
     `/project/:id/ranges` на сервере. Подтвердить можно, открыв в браузере
     `https://<сервер>/api/project/<id>/comments` — если там нет комментариев из других файлов,
     проблема серверная (данные не сохраняются в постоянное хранилище).
