# Статус реализации: Защита проектов и права пользователей

## ✅ Что полностью реализовано

### 1. Backend API (100% готово)

#### Защита проектов
- ✅ Поле `isProtected` в модели Project
- ✅ API эндпоинты:
  - `POST /api/project/:Project_id/protection` - установить защиту
  - `GET /api/project/:Project_id/protection` - получить статус
- ✅ Логика предотвращения удаления защищённых проектов
- ✅ Возврат ошибки 403 при попытке удалить защищённый проект

#### Защищённые файлы
- ✅ Поле `protectedFiles` в модели Project
- ✅ API эндпоинты:
  - `POST /api/project/:Project_id/protected-files` - установить список
  - `GET /api/project/:Project_id/protected-files` - получить список
  - `GET /api/project/:Project_id/is-file-protected/:file_path` - проверить файл
- ✅ Проверки на уровне MongoDB:
  - Блокировка удаления защищённых файлов
  - Блокировка переименования защищённых файлов
  - Блокировка изменения содержимого защищённых файлов

#### Права пользователей
- ✅ Поле `permissions` ('basic'/'full') в модели User
- ✅ API эндпоинты:
  - `POST /api/user/:user_id/permissions` - установить права
  - `GET /api/user/:user_id/permissions` - получить права
- ✅ Автоматическая установка прав при создании пользователя:
  - Обычный режим → 'full'
  - Peer-review режим → 'basic'
- ✅ Проверки прав при:
  - Создании проектов (POST `/project/new`)
  - Загрузке проектов (POST `/project/new/upload`)
  - Клонировании проектов (POST `/Project/:Project_id/clone`)
- ✅ Интеграция с админ-панелью `/admin/users/list`

### 2. Frontend (80% готово)

#### Права пользователей - UI
- ✅ Передача `userHasFullPermissions` на frontend через ExposedSettings
- ✅ Скрытие кнопок создания/загрузки/клонирования для пользователей с basic правами:
  - ✅ Кнопка "New Project" на главной странице
  - ✅ Кнопка "Copy Project" в списке проектов
  - ✅ Пункт меню "Make a Copy" в редакторе
  - ✅ Пункт "Copy Project" в левом меню редактора
  - ✅ Dropdown создания проекта на welcome странице
- ✅ Замена проверок `peerReviewMode` на `userHasFullPermissions` во всех компонентах создания/клонирования

#### Защита проектов - UI
- ✅ Передача `isProtected` в API списка проектов
- ✅ Скрытие кнопок удаления для защищённых проектов:
  - ✅ Кнопка "Trash" (переместить в корзину)
  - ✅ Кнопка "Delete" (окончательное удаление)
- ⏳ Отображение иконки замка для защищённых проектов (НЕ реализовано)

#### Защищённые файлы - UI
- ⏳ Передача `protectedFiles` в редактор (НЕ реализовано)
- ⏳ Отображение иконки замка для защищённых файлов (НЕ реализовано)
- ⏳ Скрытие кнопок удаления/переименования для защищённых файлов (НЕ реализовано)
- ⏳ Функция сворачивания/разворачивания защищённых файлов (НЕ реализовано)

#### Админ-панель
- ✅ Поле `permissions` возвращается в `/admin/users/list`
- ⏳ UI для редактирования прав пользователя (НЕ реализовано)

## 📝 Что нужно доделать (frontend)

### 1. Иконка замка для защищённых проектов

**Где:** В компонентах отображения проекта в списке

**Что делать:**
- Найти компонент, который отображает название проекта в таблице/списке
- Добавить проверку `if (project.isProtected)` и отобразить иконку замка рядом с названием
- Пример иконки: `<Icon type="lock" />` или аналог из используемой библиотеки иконок

### 2. Защищённые файлы в редакторе

**Шаги:**

#### 2.1. Передать protectedFiles на frontend
- Найти где загружаются данные проекта для редактора
- Добавить поле `protectedFiles` в запрос/ответ
- Сохранить в контексте редактора

#### 2.2. Отобразить иконки замка
- Найти компонент файлового дерева (file tree)
- Добавить логику: если путь файла в `protectedFiles`, показать иконку замка

#### 2.3. Скрыть кнопки удаления/переименования
- В контекстном меню файла проверять `isFileProtected(filePath)`
- Скрывать пункты "Delete" и "Rename"

#### 2.4. Сворачивание защищённых файлов
- Добавить кнопку-переключатель "Show/Hide Protected Files"
- При клике фильтровать файловое дерево

### 3. UI для редактирования прав в админ-панели

**Где:** Страница управления пользователями

**Что делать:**
- Найти компонент отображения списка пользователей
- Добавить dropdown/select для изменения `permissions`
- При изменении вызывать `POST /api/user/:user_id/permissions`

## 📂 Измененные файлы

### Backend
```
services/web/app/src/models/Project.js                                      (модель)
services/web/app/src/models/User.js                                         (модель)
services/web/app/src/Features/Project/ProjectProtectionController.mjs      (новый)
services/web/app/src/Features/Project/ProjectProtectionHandler.mjs         (новый)
services/web/app/src/Features/Project/ProjectController.mjs                (изменён)
services/web/app/src/Features/Project/ProjectEntityMongoUpdateHandler.js   (изменён)
services/web/app/src/Features/Project/ProjectListController.mjs            (изменён)
services/web/app/src/Features/User/UserPermissionsController.mjs           (новый)
services/web/app/src/Features/User/UserPermissionsHandler.mjs              (новый)
services/web/app/src/Features/User/UserCreator.js                          (изменён)
services/web/app/src/Features/Uploads/UploadsRouter.mjs                    (изменён)
services/web/app/src/router.mjs                                             (изменён)
services/web/app/src/infrastructure/ExpressLocals.js                       (изменён)
services/web/modules/user-activate/app/src/UserActivateController.mjs      (изменён)
```

### Frontend
```
services/web/types/exposed-settings.ts                                      (изменён)
services/web/frontend/js/features/project-list/components/new-project-button.tsx
services/web/frontend/js/features/project-list/components/table/cells/action-buttons/copy-project-button.tsx
services/web/frontend/js/features/project-list/components/table/cells/action-buttons/trash-project-button.tsx
services/web/frontend/js/features/project-list/components/table/cells/action-buttons/delete-project-button.tsx
services/web/frontend/js/features/project-list/components/table/project-tools/menu-items/copy-project-menu-item.tsx
services/web/frontend/js/features/project-list/components/welcome-message-new/welcome-message-create-new-project-dropdown.tsx
services/web/frontend/js/features/editor-left-menu/components/actions-copy-project.tsx
services/web/frontend/js/features/ide-redesign/components/toolbar/duplicate-project.tsx
services/web/frontend/js/features/ide-redesign/components/toolbar/menu-bar.tsx
```

## 🧪 Как протестировать реализованное

### 1. Тестирование прав пользователей

```bash
# Запустите систему
cd develop
bin/dev web

# В браузере:
# 1. Создайте пользователя с базовыми правами через API:
curl -X POST http://localhost/api/user/USER_ID/permissions \
  -H "Cookie: overleaf_session2=..." \
  -d '{"permissions": "basic"}'

# 2. Войдите под этим пользователем
# 3. Проверьте, что кнопки "New Project", "Upload", "Copy" скрыты
```

### 2. Тестирование защиты проектов

```bash
# 1. Создайте проект
# 2. Защитите его через API:
curl -X POST http://localhost/api/project/PROJECT_ID/protection \
  -H "Cookie: overleaf_session2=..." \
  -d '{"isProtected": true}'

# 3. Попробуйте удалить проект через UI - кнопки должны быть скрыты
# 4. Попробуйте удалить через API - должна быть ошибка 403
```

### 3. Тестирование защищённых файлов

```bash
# 1. Создайте проект с файлами
# 2. Установите защищённые файлы:
curl -X POST http://localhost/api/project/PROJECT_ID/protected-files \
  -H "Cookie: overleaf_session2=..." \
  -d '{"protectedFiles": ["/main.tex"]}'

# 3. В редакторе попробуйте удалить/переименовать main.tex
# 4. Должна быть ошибка на бэкенде
```

## 📚 Документация

- [API_PROTECTION_PERMISSIONS.md](./API_PROTECTION_PERMISSIONS.md) - Полная API документация (EN)
- [IMPLEMENTATION_SUMMARY_RU.md](./IMPLEMENTATION_SUMMARY_RU.md) - Детальное резюме (RU)

## 🎯 Приоритеты для доработки

**Высокий приоритет:**
1. UI для редактирования прав в админ-панели - важно для управления пользователями
2. Иконки замка для защищённых проектов - визуальная индикация

**Средний приоритет:**
3. Передача protectedFiles в редактор
4. Скрытие кнопок удаления/переименования для защищённых файлов

**Низкий приоритет:**
5. Иконки замка для защищённых файлов
6. Функция сворачивания защищённых файлов

## 💡 Примечания

### Обратная совместимость
- Проверки `peerReviewMode` оставлены только там, где они не конфликтуют с новой логикой
- Все существующие пользователи получат `permissions: 'full'` по умолчанию
- Все существующие проекты будут `isProtected: false` по умолчанию

### Архитектурные решения
- Права пользователей проверяются на уровне индивидуального пользователя, а не глобально
- Защита проектов и файлов проверяется на уровне MongoDB операций (не обходится)
- Все API эндпоинты защиты требуют прав администратора

### Производительность
- Проверка прав пользователя выполняется один раз при загрузке страницы (кешируется в ExpressLocals)
- Данные о защите проектов передаются вместе с основными данными (без дополнительных запросов)

## 🔍 Где искать компоненты для доработки

### Файловое дерево редактора
```bash
find services/web/frontend/js/features -name "*file*tree*" -o -name "*file*list*"
```

### Админ-панель пользователей
```
services/web/modules/user-activate/
services/web/frontend/js/features/admin/ (если есть)
```

### Иконки проектов
```bash
grep -r "project.*name" services/web/frontend/js/features/project-list/
```

## ✨ Заключение

**Готово к использованию:**
- Все backend функции работают через API
- Права пользователей работают корректно
- Защита проектов от удаления работает
- Защита файлов от изменения/удаления работает

**Требует UI доработки:**
- Визуальные индикаторы (иконки замка)
- UI для управления правами в админке
- Функция сворачивания файлов

Система полностью функциональна на уровне API и может использоваться через прямые HTTP запросы или скрипты. UI доработки - это вопрос удобства пользователя.
