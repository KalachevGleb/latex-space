# ✅ Финальное упрощённое решение

## 🎯 Ключевые принципы

1. **MD5 всех файлов** - для отслеживания изменений
2. **Инкрементальная версия** (1, 2, 3, ...) - инкрементируется при изменении md5
3. **NO "compilation already running" error** - вместо этого ждём результата
4. **Кэш по projectId + config** - одинаков для всех пользователей

## 🔄 Логика

### При запросе компиляции:

```
1. Рассчитать MD5 всех файлов проекта
2. Сравнить с последним MD5
   - Если разный → инкрементировать версию, очистить кэш
   - Если одинаковый → ничего не делать
3. Проверить кэш для текущих настроек
   - Если есть → вернуть из кэша
4. Проверить, запущена ли компиляция с такими же настройками
   - Если да → добавить пользователя в waiting list, ЖДАТЬ результата
   - Если нет → запустить новую компиляцию
5. После завершения → сохранить в кэш, уведомить всех ожидающих
```

## 📝 Реализация

### CompilationQueueManager.js

**Хранение версий:**
```javascript
// Map: projectId -> { version: number, filesMd5: string }
this.projectVersions = new Map()
```

**Метод проверки изменений:**
```javascript
checkAndUpdateVersion(projectId, filesMd5) {
  const versionInfo = this.projectVersions.get(projectId) || { version: 0, filesMd5: null }
  
  if (versionInfo.filesMd5 !== filesMd5) {
    const newVersion = versionInfo.version + 1
    this.projectVersions.set(projectId, { version: newVersion, filesMd5 })
    
    // Очистить кэш
    const state = this.states.get(projectId)
    if (state) {
      state.compilations.clear()
      state.projectVersion = newVersion
    }
    
    return true
  }
  
  return false
}
```

### CompileManager.js

**Расчёт MD5:**
```javascript
function calculateFilesMd5(resources) {
  if (!resources || resources.length === 0) {
    return 'empty'
  }
  
  const crypto = require('node:crypto')
  const hash = crypto.createHash('md5')
  
  // Сортировать для стабильности
  const sorted = [...resources].sort((a, b) => a.path.localeCompare(b.path))
  
  for (const resource of sorted) {
    hash.update(resource.path)
    if (resource.content) {
      hash.update(resource.content)
    }
  }
  
  return hash.digest('hex')
}
```

**Ожидание результата вместо ошибки:**
```javascript
// Если присоединяемся к существующей компиляции
if (queueResult.status === 'compile-in-progress' && !queueResult.shouldCompile) {
  // ЖДЁМ, а не выбрасываем ошибку!
  return await waitForCompilationResult(request.project_id, queueResult.configHash)
}

async function waitForCompilationResult(projectId, configHash, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      if (event.projectId === projectId && event.configHash === configHash) {
        // Отписаться и вернуть результат
        resolve(event.result)
      }
    }
    
    CompilationQueueManager.on('compilation-complete', handler)
    // ... timeout logic
  })
}
```

## 🎬 Сценарии

### Сценарий 1: Первая компиляция

```
User A → Compile
  ↓
calculateFilesMd5(resources) → "abc123"
checkAndUpdateVersion("project1", "abc123")
  ├─ version: 0 → 1
  └─ filesMd5: null → "abc123"
  ↓
requestCompilation()
  ├─ Кэш пуст
  └─ shouldCompile: true
  ↓
Компиляция → Результат → Сохранить в кэш
```

### Сценарий 2: Повторная компиляция без изменений

```
User A → Compile
  ↓
calculateFilesMd5(resources) → "abc123" (тот же!)
checkAndUpdateVersion("project1", "abc123")
  └─ md5 не изменился → ничего не делать
  ↓
requestCompilation()
  └─ В кэше есть результат → fromCache: true
  ↓
Мгновенный возврат ✅
```

### Сценарий 3: Компиляция после изменения

```
User A → Редактирует файл → Compile
  ↓
calculateFilesMd5(resources) → "def456" (другой!)
checkAndUpdateVersion("project1", "def456")
  ├─ md5 изменился!
  ├─ version: 1 → 2
  ├─ filesMd5: "abc123" → "def456"
  └─ compilations.clear() (кэш очищен!)
  ↓
requestCompilation()
  ├─ Кэш пуст
  └─ shouldCompile: true
  ↓
Новая компиляция ✅
```

### Сценарий 4: Два пользователя одновременно

```
User A → Compile (первый)
  ↓
shouldCompile: true → Запуск компиляции
  ↓
User B → Compile (пока User A компилирует)
  ↓
shouldCompile: false (компиляция уже идёт)
  ↓
waitForCompilationResult() → ЖДАТЬ
  ↓
User A завершает → emit('compilation-complete')
  ↓
User B получает результат ✅
```

### Сценарий 5: Второй пользователь после завершения

```
User A → Compile → Результат в кэше

User B → Compile (та же версия, те же настройки)
  ↓
calculateFilesMd5(resources) → "abc123" (тот же md5)
checkAndUpdateVersion() → ничего не меняется
  ↓
requestCompilation()
  └─ Кэш содержит результат → fromCache: true
  ↓
User B видит PDF мгновенно ✅
```

## ✅ Решённые проблемы

| Проблема | Решение |
|----------|---------|
| ❌ "Previous compilation is still running" | ✅ `waitForCompilationResult()` - ждём, не выбрасываем ошибку |
| ❌ Кэш не работает | ✅ MD5 для version tracking, config для кэша |
| ❌ Изменения не детектируются | ✅ MD5 файлов меняется → версия++ → кэш очищается |
| ❌ User B получает 404 | ✅ Output по `projectId` (НЕ `projectId-userId`) → все видят один файл |
| ❌ Переусложнённая логика с buildId | ✅ Простой MD5 всех файлов |
| ❌ Дублирование файлов для каждого пользователя | ✅ `getCompileName()` использует только `projectId` |
| ❌ Нет способа обновить даты (force recompile) | ✅ Флаг `force` - игнорирует кэш, очищает временные файлы |

## 🧪 Тестирование

### Тест 1: Кэширование

```bash
# 1. Compile
# 2. Recompile (без изменений)
# Ожидание: Мгновенно из кэша ✅
```

### Тест 2: Изменения

```bash
# 1. Compile
# 2. Изменить .tex файл
# 3. Recompile
# Ожидание: Новая компиляция, изменения в PDF ✅
```

### Тест 3: Два пользователя

```bash
# User A: Compile
# User B: Открыть тот же проект, Compile
# Ожидание: User B видит результат (НЕ 404) ✅
```

### Тест 4: Одновременная компиляция

```bash
# User A: Compile (долгий проект)
# User B: Сразу Compile
# Ожидание: User B ждёт, затем получает результат (НЕ ошибка) ✅
```

## 🔍 Логи

```bash
# Смотреть version tracking
docker logs -f develop-clsi-1 2>&1 | grep -E "version.*incremented|filesMd5"

# Ожидаемые логи:
# "project files changed, version incremented oldVersion=0 newVersion=1 filesMd5=abc123..."
```

```bash
# Смотреть ожидание компиляции
docker logs -f develop-clsi-1 2>&1 | grep -E "joining.*waiting|compilation completed"

# Ожидаемые логи:
# "joining existing compilation, waiting for result"
# "compilation completed"
```

## 📁 Структура хранения

### Output по projectId (БЕЗ userId):
```
output/
  └── projectId/             ✅ Общая папка для всех пользователей
      └── build/
          └── xxx/
              ├── output.pdf
              └── output.log
```

**Преимущества:**
- Один PDF для 100 пользователей (а не 100 копий)
- User B видит результат User A
- Нет 404 ошибок
- Экономия места на диске

## 📊 Преимущества

1. **Простота** - MD5 файлов, инкрементальная версия
2. **Надёжность** - НЕТ ошибки "already compiling", только ожидание
3. **Эффективность** - Кэш работает для всех пользователей, результат общий
4. **Правильность** - Изменения детектируются, кэш сбрасывается
5. **Экономия** - Нет дублирования файлов для каждого пользователя

## 🎯 Ключевые моменты

### MD5
- Рассчитывается из **всех** файлов проекта (paths + content)
- Стабилен для одинакового содержимого
- Меняется при любом изменении файла

### Version
- Простой инкремент: 1, 2, 3, ...
- Инкрементируется только при изменении MD5
- При инкременте → кэш очищается

### Config Hash
- Hash **только** настроек компиляции
- **НЕ** включает MD5 файлов
- Используется как ключ кэша

### Ожидание
- Вместо ошибки → ожидание через EventEmitter
- Timeout 5 минут
- Все получают результат одновременно

## 🔄 Дополнительно: Force Recompile

### Флаг `force` для принудительной перекомпиляции

Добавлен флаг `force` в опции компиляции:

```javascript
{
  compile: {
    options: {
      compiler: "pdflatex",
      force: true  // ← Принудительная перекомпиляция
    }
  }
}
```

### Логика Force Recompile:

1. **Очистка временных файлов** - удаляются `.aux`, `.log` и т.д.
2. **Игнорирование кэша** - результат НЕ берётся из кэша
3. **Запуск компиляции** - реальная компиляция с нуля
4. **Обновление кэша** - новый результат сохраняется в кэш
5. **Умное ожидание** - если другой пользователь уже запустил force компиляцию → присоединиться (не дублировать)

### Применение:

- Обновить даты в документе (`\today`)
- Гарантировать чистую сборку перед финальной версией
- Сбросить временные файлы при проблемах

### Важно:

- `force` **НЕ** включается в `configHash` 
- Force компиляции присоединяются к существующим (не создают дубликаты)
- Результат доступен всем пользователям через обновлённый кэш

✅ **Готово к использованию!**

