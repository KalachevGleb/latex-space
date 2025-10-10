# Панель математических символов

## Что реализовано

1. **Компонент панели символов** (`services/web/modules/symbol-palette/frontend/js/components/math-symbols-panel.tsx`)
   - 8 групп символов: операторы, сравнения, стрелки, греческие (строчные/заглавные), множества, логика, разное
   - Всего 200+ символов
   - Все группы изначально свёрнуты
   - Клик по символу вставляет его в редактор в позицию курсора
   - **Конфигурация в отдельном файле** (`symbols-config.ts`) для удобного редактирования

2. **Размещение панели**
   - Можно разместить снизу от редактора (по умолчанию)
   - Можно разместить снизу от боковой панели (файлы/outline)
   - Переключение через кнопку в тулбаре

3. **Интеграция**
   - Модуль `symbol-palette` зарегистрирован в `moduleImportSequence`
   - Компонент зарегистрирован в `sourceEditorSymbolPalette` для автоматической загрузки
   - Добавлены стили в `services/web/frontend/stylesheets/components/symbol-palette.scss`
   - Поддержка светлой и тёмной темы

## Как использовать

1. **Перезапустите сервер разработки:**
   ```bash
   cd develop
   bin/down
   bin/up
   ```

2. **Откройте проект в редакторе**

3. **Нажмите кнопку Ω в тулбаре** чтобы показать/скрыть панель символов

4. **Переключайте размещение** кнопкой справа от Ω:
   - Иконка `view_stream` = под редактором
   - Иконка `view_sidebar` = под боковой панелью

5. **Раскройте группу** кликом по заголовку группы

6. **Вставьте символ** кликом по нему - он появится в текущей позиции курсора

## Структура файлов

```
services/web/
  ├── config/
  │   └── settings.defaults.js           # Регистрация модуля
  ├── modules/
  │   └── symbol-palette/
  │       ├── index.mjs                   # Определение модуля
  │       └── frontend/
  │           ├── js/
  │           │   └── components/
  │           │       └── math-symbols-panel.tsx  # Компонент панели
  │           └── stylesheets/
  │               └── symbol-palette-module.scss  # Стили модуля
  └── frontend/
      ├── js/
      │   └── features/
      │       ├── ide-react/
      │       │   ├── context/
      │       │   │   └── editor-properties-context.tsx  # Добавлен placement
      │       │   └── components/
      │       │       ├── editor/
      │       │       │   └── editor-pane.tsx            # Панель под редактором
      │       │       └── editor-sidebar.tsx             # Панель под сайдбаром
      │       ├── ide-redesign/
      │       │   └── components/
      │       │       ├── editor.tsx                     # Панель под редактором (новый дизайн)
      │       │       └── file-tree/
      │       │           └── file-tree-outline-panel.tsx  # Панель под сайдбаром (новый дизайн)
      │       └── source-editor/
      │           └── components/
      │               └── toolbar/
      │                   └── toolbar-items.tsx           # Кнопки переключения
      └── stylesheets/
          └── components/
              ├── all.scss                  # Импорт стилей
              └── symbol-palette.scss       # Основные стили панели
```

## Возможные проблемы

### Панель не отображается
- Убедитесь, что модуль `symbol-palette` добавлен в `moduleImportSequence`
- Проверьте, что путь к компоненту в `sourceEditorSymbolPalette` правильный
- Перезапустите webpack: `cd develop && bin/down && bin/up`

### Кнопки не видны
- Убедитесь, что стили импортированы в `components/all.scss`
- Проверьте консоль браузера на ошибки загрузки CSS
- Попробуйте очистить кэш браузера

### Символы не вставляются
- Проверьте консоль браузера - должно быть сообщение "MathSymbolsPanel loaded"
- Убедитесь, что событие `editor:insert-symbol` правильно диспатчится
- Проверьте, что расширение `symbolPalette()` подключено в CodeMirror

## Настройка символов

**Все символы настраиваются в одном месте:**
`services/web/modules/symbol-palette/frontend/js/symbols-config.ts`

### Как добавить символы:

1. Откройте `symbols-config.ts`
2. Найдите нужную группу или создайте новую
3. Добавьте символ в массив:

```typescript
{ id: 'my-symbol', label: '⊕', command: '\\oplus ' }
```

### Как удалить группу:

Просто удалите нужный объект из массива `SYMBOL_GROUPS` в `symbols-config.ts`.

### Как изменить размер кнопок:

Откройте `services/web/frontend/stylesheets/components/symbol-palette.scss` и измените:

```scss
.ol-symbols-item {
  min-height: 28px;  // Высота кнопки
  font-size: 16px;   // Размер символа
}
```

**Подробная документация:** `services/web/modules/symbol-palette/README.md`

## Дальнейшие улучшения

- Сохранять состояние сворачивания групп в localStorage
- Добавить поиск по символам
- Добавить недавно использованные символы
- Поддержка пользовательских символов через UI

