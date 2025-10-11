# Настройки языка интерфейса

Реализована функциональность управления языком интерфейса на уровне администратора и пользователя.

## Возможности

### Административная панель
- В админ-панели (`/admin`) добавлена новая вкладка **"Settings"** (Настройки)
- Администратор может выбрать язык интерфейса по умолчанию для всего сайта
- Доступные языки:
  - English (en)
  - Русский (ru)
  - Español (es)
  - Deutsch (de)
  - Français (fr)
  - Português (pt)
  - Italiano (it)
  - 中文 简体 (zh-CN)
  - 日本語 (ja)
  - 한국어 (ko)

### Настройки пользователя
- В настройках аккаунта (`/user/settings`) добавлена секция **"Interface Language"**
- Каждый пользователь может выбрать свой язык интерфейса
- Опция **"Default"** использует язык, установленный администратором

## Архитектура

### Backend изменения

1. **Модель User** (`services/web/app/src/models/User.js`)
   - Добавлено поле `ace.interfaceLanguage` со значением по умолчанию `'default'`

2. **SystemSettings** (`services/web/app/src/Features/SystemSettings/SystemSettingsManager.mjs`)
   - Добавлена настройка `defaultLanguage` со значением по умолчанию `'en'`

3. **AdminController** (`services/web/app/src/Features/ServerAdmin/AdminController.mjs`)
   - Добавлен метод `setDefaultLanguage()` для сохранения языка по умолчанию
   - Обновлен метод `index()` для передачи текущей настройки в шаблон

4. **UserController** (`services/web/app/src/Features/User/UserController.mjs`)
   - Обновлен метод `updateUserSettings()` для обработки поля `interfaceLanguage`

5. **UserPagesController** (`services/web/app/src/Features/User/UserPagesController.mjs`)
   - Добавлена передача `userSettings` в шаблон страницы настроек

6. **ProjectController** (`services/web/app/src/Features/Project/ProjectController.mjs`)
   - Добавлено поле `interfaceLanguage` в `userSettings` для редактора

7. **UserLanguageMiddleware** (`services/web/app/src/infrastructure/UserLanguageMiddleware.mjs`)
   - Новый middleware для применения языковых настроек пользователя
   - Логика применения:
     1. Если пользователь авторизован и у него установлен конкретный язык → использовать его
     2. Если у пользователя язык 'default' → использовать язык по умолчанию из настроек сайта
     3. Если пользователь не авторизован → использовать язык по умолчанию из настроек сайта
     4. Fallback на стандартную логику определения языка

8. **Routes** (`services/web/app/src/router.mjs`)
   - Добавлен роут `POST /admin/settings/defaultLanguage` для сохранения языка по умолчанию

9. **Server** (`services/web/app/src/infrastructure/Server.mjs`)
   - Добавлен `setUserLanguageMiddleware` в цепочку middleware

### Frontend изменения

1. **InterfaceLanguageSection** (`services/web/frontend/js/features/settings/components/interface-language-section.tsx`)
   - Новый React-компонент для управления языком пользователя
   - После сохранения настройки перезагружает страницу для применения изменений

2. **Settings Root** (`services/web/frontend/js/features/settings/components/root.tsx`)
   - Добавлен `InterfaceLanguageSection` в страницу настроек пользователя

3. **UserSettings Type** (`services/web/types/user-settings.ts`)
   - Добавлено опциональное поле `interfaceLanguage?: string`

### View изменения

1. **Admin Panel** (`services/web/app/views/admin/index.pug`)
   - Добавлена вкладка "Settings" с формой выбора языка по умолчанию

2. **User Settings** (`services/web/app/views/user/settings.pug`)
   - Добавлен meta-тег `ol-userSettings` для передачи настроек на frontend

## API Endpoints

### Административные
- `POST /admin/settings/defaultLanguage`
  - Body: `{ language: string }`
  - Сохраняет язык по умолчанию для сайта

### Пользовательские
- `POST /user/settings`
  - Body: `{ interfaceLanguage: string, ... }`
  - Обновляет настройки пользователя, включая язык интерфейса

## База данных

### SystemSettings Collection
```javascript
{
  key: 'defaultLanguage',
  value: 'en' // или другой код языка
}
```

### Users Collection
```javascript
{
  ace: {
    interfaceLanguage: 'default' // или конкретный код языка
  }
}
```

## Использование

### Для администратора
1. Войти в админ-панель `/admin`
2. Перейти на вкладку "Settings"
3. Выбрать язык по умолчанию из выпадающего списка
4. Нажать "Save Settings"

### Для пользователя
1. Войти в настройки аккаунта `/user/settings`
2. Найти секцию "Interface Language"
3. Выбрать желаемый язык или "Default"
4. Нажать "Update"
5. Страница автоматически перезагрузится с новым языком

## Примечания

- Изменение языка применяется немедленно после перезагрузки страницы
- Для неавторизованных пользователей используется язык по умолчанию
- Middleware проверяет доступность выбранного языка в списке поддерживаемых языков i18next
- При ошибках загрузки настроек используется fallback-значение
- В `Translations.js` добавлен список всех доступных языков интерфейса (соответствует файлам в `/services/web/locales/`)
- Поддерживаемые языки интерфейса: cs, da, de, en, es, fi, fr, it, ja, ko, nl, no, pl, pt, ru, sv, tr, zh-CN

## Устранение неполадок

### Язык не меняется после установки в настройках

**Проблема:** После выбора языка (например, русского) в админ-панели или настройках пользователя, интерфейс остается на английском.

**Решение:** Убедитесь, что:
1. В файле `Translations.js` добавлен список `additionalLanguageCodes` со всеми поддерживаемыми языками
2. Файл локализации существует в `/services/web/locales/` (например, `ru.json`)
3. После изменения перезапустите dev-сервер командой `bin/dev`
4. Очистите кэш браузера и перезагрузите страницу

### Язык перезаписывается субдоменом

**Проблема:** Настройки языка пользователя не применяются, и используется язык по умолчанию для субдомена.

**Решение:** В `setLangBasedOnDomainMiddleware` добавлена проверка флага `req.userLanguageSet`, который предотвращает переопределение языка пользователя настройками субдомена.

