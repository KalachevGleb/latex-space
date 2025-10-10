# Symbol Palette Module

Модуль панели математических символов для Overleaf.

## Конфигурация символов

Все символы настраиваются в файле `frontend/js/symbols-config.ts`.

### Структура конфигурации

```typescript
export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'unique-group-id',      // Уникальный идентификатор группы
    title: 'Название группы',    // Отображается в заголовке
    symbols: [
      {
        id: 'unique-symbol-id',  // Уникальный идентификатор символа
        label: 'α',              // Символ как он отображается визуально
        command: '\\alpha '      // LaTeX команда для вставки
      },
      // ... другие символы
    ]
  },
  // ... другие группы
]
```

### Как добавить новую группу символов

1. Откройте `frontend/js/symbols-config.ts`
2. Добавьте новый объект в массив `SYMBOL_GROUPS`:

```typescript
{
  id: 'my-new-group',
  title: 'Моя группа',
  symbols: [
    { id: 'symbol1', label: '⊕', command: '\\oplus ' },
    { id: 'symbol2', label: '⊗', command: '\\otimes ' },
  ]
}
```

### Как удалить группу

Просто удалите соответствующий объект из массива `SYMBOL_GROUPS`.

### Как добавить/удалить символы в группе

Отредактируйте массив `symbols` нужной группы:

```typescript
{
  id: 'operators',
  title: 'Операторы',
  symbols: [
    { id: 'plus', label: '+', command: '+' },
    { id: 'minus', label: '−', command: '-' },
    // Добавьте новый символ:
    { id: 'my-op', label: '⊛', command: '\\circledast ' },
  ]
}
```

### Советы

- **id**: должен быть уникальным в пределах группы (латинские буквы и дефисы)
- **label**: Unicode символ, как он будет отображаться в кнопке
- **command**: LaTeX команда, обычно завершается пробелом для удобства
- Порядок групп и символов в массиве = порядок отображения в панели

## Текущие группы

1. **Операторы** - арифметические операторы, суммы, произведения
2. **Сравнения** - операторы сравнения и эквивалентности
3. **Стрелки** - различные виды стрелок
4. **Греческие (строчные)** - строчные греческие буквы
5. **Греческие (заглавные)** - заглавные греческие буквы
6. **Множества** - операции с множествами
7. **Логика** - логические операторы и кванторы
8. **Разное** - специальные символы (бесконечность, частные производные и т.д.)

## Стили

Стили настраиваются в `services/web/frontend/stylesheets/components/symbol-palette.scss`.

### Основные параметры стилей

- **Размер кнопки**: `.ol-symbols-item { min-height: 28px; }`
- **Размер шрифта символа**: `.ol-symbols-item { font-size: 16px; }`
- **Размер сетки**: `.ol-symbols-grid { grid-template-columns: repeat(auto-fill, minmax(32px, 1fr)); }`
- **Отступы**: `.ol-symbols-panel { padding: 4px 6px; }`

### Цвета

Светлая тема:
- Фон панели: `#fff`
- Фон кнопки: `#fafafa`
- Hover: `#e7f4ff`
- Граница: `#ddd`

Тёмная тема:
- Фон панели: `#1e1e1e`
- Фон кнопки: `#252525`
- Hover: `#1a3a52`
- Граница: `#3a3a3a`

## Примеры изменений

### Пример 1: Добавить группу "Дроби"

```typescript
{
  id: 'fractions',
  title: 'Дроби',
  symbols: [
    { id: 'frac', label: '½', command: '\\frac{}{}' },
    { id: 'tfrac', label: '¼', command: '\\tfrac{}{}' },
    { id: 'dfrac', label: '¾', command: '\\dfrac{}{}' },
  ]
}
```

### Пример 2: Удалить все стрелки, кроме базовых

```typescript
{
  id: 'arrows',
  title: 'Стрелки',
  symbols: [
    { id: 'leftarrow', label: '←', command: '\\leftarrow ' },
    { id: 'rightarrow', label: '→', command: '\\rightarrow ' },
    { id: 'Rightarrow', label: '⇒', command: '\\Rightarrow ' },
    // Остальные удалены
  ]
}
```

### Пример 3: Изменить размер кнопок

В `symbol-palette.scss`:

```scss
.ol-symbols-item {
  min-height: 36px;  // было 28px
  font-size: 18px;   // было 16px
}

.ol-symbols-grid {
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));  // было 32px
}
```

## После изменений

После любых изменений в `symbols-config.ts` или `.scss`:

```bash
cd develop
bin/down
bin/up
```

Webpack автоматически пересоберёт модуль при следующем запуске.

