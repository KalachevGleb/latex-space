# 🎨 Frontend Integration: Force Recompile

## Как интегрировать "Recompile from scratch" во frontend

### 1. Найти обработчик кнопки "Recompile"

Вероятно, это где-то в:
- `services/web/frontend/js/features/pdf-preview/`
- или `services/web/frontend/js/features/ide-react/`

### 2. Добавить параметр `force` в запрос компиляции

**Было:**
```typescript
const compileRequest = {
  compile: {
    options: {
      compiler: 'pdflatex',
      // ... other options
    },
    rootDoc_id: rootDocId,
    resources: resources,
  }
}
```

**Стало:**
```typescript
const compileRequest = {
  compile: {
    options: {
      compiler: 'pdflatex',
      force: forceRecompile,  // ← Добавить флаг
      // ... other options
    },
    rootDoc_id: rootDocId,
    resources: resources,
  }
}
```

### 3. Определить когда включать `force`

**Вариант A: Отдельная кнопка**
```typescript
// Обычная кнопка Recompile
<button onClick={() => compile({ force: false })}>
  Recompile
</button>

// Новая кнопка Recompile from Scratch
<button onClick={() => compile({ force: true })}>
  Recompile from Scratch
</button>
```

**Вариант B: Dropdown меню**
```typescript
<Dropdown>
  <DropdownToggle>Recompile</DropdownToggle>
  <DropdownMenu>
    <DropdownItem onClick={() => compile({ force: false })}>
      Recompile
    </DropdownItem>
    <DropdownItem onClick={() => compile({ force: true })}>
      Recompile from Scratch
    </DropdownItem>
  </DropdownMenu>
</Dropdown>
```

**Вариант C: Keyboard shortcut**
```typescript
// Ctrl+R - обычная компиляция
// Ctrl+Shift+R - force компиляция

useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault()
      compile({ force: e.shiftKey })
    }
  }
  
  window.addEventListener('keydown', handleKeyPress)
  return () => window.removeEventListener('keydown', handleKeyPress)
}, [])
```

### 4. Пример полной интеграции

```typescript
// compile-button.tsx

import { useState } from 'react'
import { useCompile } from './use-compile'

export function CompileButton() {
  const { compile, isCompiling } = useCompile()
  const [showMenu, setShowMenu] = useState(false)
  
  const handleCompile = async (force: boolean = false) => {
    try {
      await compile({ force })
      setShowMenu(false)
    } catch (error) {
      console.error('Compilation failed:', error)
    }
  }
  
  return (
    <div className="compile-button-group">
      <button 
        onClick={() => handleCompile(false)}
        disabled={isCompiling}
        className="btn btn-primary"
      >
        {isCompiling ? 'Compiling...' : 'Recompile'}
      </button>
      
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="btn btn-primary dropdown-toggle"
      >
        ▼
      </button>
      
      {showMenu && (
        <ul className="dropdown-menu show">
          <li>
            <a onClick={() => handleCompile(false)}>
              Recompile
            </a>
          </li>
          <li>
            <a onClick={() => handleCompile(true)}>
              Recompile from Scratch
            </a>
          </li>
        </ul>
      )}
    </div>
  )
}
```

### 5. Обработка response

CLSI вернёт те же самые данные, независимо от `force`:

```typescript
// Response будет таким же:
{
  compile: {
    status: 'success',
    outputFiles: [...],
    buildId: '...'
  }
}

// Или если компиляция уже идёт:
{
  compile: {
    status: 'compile-in-progress',
    error: 'compile in progress'
  }
}
```

Никаких изменений в обработке response не требуется!

### 6. UI подсказки (опционально)

```typescript
<Tooltip content="Recompile from scratch. Clears cache and temporary files. Useful for updating dates.">
  <button onClick={() => compile({ force: true })}>
    Recompile from Scratch
  </button>
</Tooltip>
```

## 🎯 Рекомендации

### 1. Где разместить кнопку

**Хорошие варианты:**
- Dropdown рядом с кнопкой Recompile
- В меню "Actions" / "Tools"
- Keyboard shortcut (документировать в Help)

**Плохие варианты:**
- Заменить основную кнопку Recompile (пользователи будут путаться)
- Скрыть глубоко в настройках (нужен быстрый доступ)

### 2. Название кнопки

**Хорошие варианты:**
- "Recompile from Scratch"
- "Force Recompile"
- "Clean & Recompile"

**Плохие варианты:**
- "Clear Cache" (звучит как удаление данных)
- "Hard Recompile" (непонятно что это значит)

### 3. Когда использовать

Показать подсказку пользователю:
- "Use this when dates need to be updated"
- "Clears temporary files and cache"
- "Slower than regular recompile"

### 4. Индикация

Можно показать что идёт force компиляция:
```typescript
{isCompiling && (
  <div className="compile-status">
    {isForceCompile ? 'Compiling from scratch...' : 'Compiling...'}
  </div>
)}
```

## 🧪 Тестирование

### Тест 1: Проверить флаг передаётся

```typescript
// В Network tab браузера проверить:
POST /project/{id}/compile

Request Body:
{
  "compile": {
    "options": {
      "force": true  // ← Должен быть здесь
    }
  }
}
```

### Тест 2: Функциональный тест

```typescript
describe('Force Recompile', () => {
  it('should recompile with force=true', async () => {
    const { compile } = renderHook(() => useCompile())
    
    const result = await compile({ force: true })
    
    expect(result.status).toBe('success')
    // Проверить что запрос был с force: true
  })
  
  it('should update dates in document', async () => {
    // 1. Compile с \today
    // 2. Проверить дату в PDF
    // 3. Force Recompile на следующий день
    // 4. Проверить что дата обновилась
  })
})
```

## 📝 Примеры из существующих UI

### Пример 1: Dropdown в toolbar

```typescript
// Может быть примерно так в Overleaf:
<ToolbarButton
  icon="refresh"
  onClick={() => compile({ force: false })}
  dropdownItems={[
    { label: 'Recompile', onClick: () => compile({ force: false }) },
    { label: 'Recompile from Scratch', onClick: () => compile({ force: true }) },
  ]}
>
  Recompile
</ToolbarButton>
```

### Пример 2: Context menu

```typescript
// Правый клик на PDF viewer
<ContextMenu items={[
  { label: 'Recompile', shortcut: 'Ctrl+R', onClick: () => compile({ force: false }) },
  { label: 'Recompile from Scratch', shortcut: 'Ctrl+Shift+R', onClick: () => compile({ force: true }) },
  // ... other items
]} />
```

## ✅ Checklist для интеграции

- [ ] Найти функцию compile() во frontend
- [ ] Добавить параметр `force` в запрос
- [ ] Добавить UI элемент (кнопку/пункт меню)
- [ ] Добавить tooltip с объяснением
- [ ] (Опционально) Добавить keyboard shortcut
- [ ] Протестировать что флаг передаётся в CLSI
- [ ] Протестировать функциональность (обновление дат)
- [ ] Обновить документацию для пользователей

## 🔍 Где искать код

Вероятные файлы:
```
services/web/frontend/js/features/pdf-preview/
  ├── components/
  │   └── pdf-compile-button.tsx  (?)
  ├── hooks/
  │   └── use-compile.ts  (?)
  └── util/
      └── compiler.ts  (?)
```

Поиск по коду:
```bash
# Найти где отправляется compile запрос
grep -r "compile.*options" services/web/frontend/

# Найти компонент кнопки Recompile
grep -r "Recompile" services/web/frontend/ | grep -i button
```

---

**Backend готов!** Теперь только нужно добавить `force: true` в frontend запрос. 🚀

