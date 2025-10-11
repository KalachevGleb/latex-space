# ✅ Исправление: Правильная архитектура кэширования

## ❌ Предыдущая ошибочная реализация

Я неправильно понял архитектуру и сделал:
1. ❌ Per-user кэширование (`projectId:userId`) - НЕПРАВИЛЬНО!
2. ❌ buildId в configHash - НЕПРАВИЛЬНО!
3. ❌ Результат не доступен другим пользователям

## ✅ Правильная архитектура

### Ключевые принципы:

1. **Кэш по projectId + config** (БЕЗ userId!)
   - Результат компиляции одинаков для всех пользователей при одинаковых настройках
   - Кэш хранится на уровне проекта, а не пользователя

2. **Version tracking через buildId**
   - buildId генерируется Web service и меняется при изменении файлов
   - buildId используется для **детекции** изменений, но **НЕ** для кэширования
   - При смене buildId → инкрементируется версия проекта → кэш очищается

3. **Per-user папки ТОЛЬКО для процесса**
   - Каждый пользователь компилирует в своей папке (изоляция)
   - Но результаты доступны всем пользователям

## 🔄 Что изменено

### CompilationQueueManager.js

**1. Вернули per-project кэширование:**
```javascript
// Было (НЕПРАВИЛЬНО):
const stateKey = `${projectId}:${userId}`

// Стало (ПРАВИЛЬНО):
this.states = new Map() // projectId -> ProjectCompilationState
```

**2. Добавили инкрементальное version tracking:**
```javascript
// Map: projectId -> version number (1, 2, 3, ...)
this.projectVersions = new Map()

// Map: projectId -> last buildId (для детекции изменений)
this.lastBuildIds = new Map()
```

**3. Метод notifyProjectChanged:**
```javascript
notifyProjectChanged(projectId) {
  const currentVersion = this.projectVersions.get(projectId) || 0
  const newVersion = currentVersion + 1
  this.projectVersions.set(projectId, newVersion)
  
  // Очистить кэш
  const state = this.states.get(projectId)
  if (state) {
    state.compilations.clear()
    state.projectVersion = newVersion
  }
}
```

**4. Убрали buildId из configHash:**
```javascript
_hashConfig(config) {
  const canonical = {
    compiler: config.compiler,
    rootDocId: config.rootDoc_id,
    draft: config.draft || false,
    stopOnFirstError: config.stopOnFirstError || false,
    imageName: config.imageName || 'default',
    flags: config.flags || [],
    // buildId НЕ включён!
  }
  // ...
}
```

**5. Методы для buildId tracking:**
```javascript
getLastBuildId(projectId)
setLastBuildId(projectId, buildId)
```

### CompileManager.js

**1. Детекция изменений через buildId:**
```javascript
// Проверить buildId перед компиляцией
if (request.buildId) {
  const lastBuildId = CompilationQueueManager.getLastBuildId(request.project_id)
  if (lastBuildId && lastBuildId !== request.buildId) {
    // buildId изменился → файлы изменились → инкрементировать версию
    CompilationQueueManager.notifyProjectChanged(request.project_id)
  }
  CompilationQueueManager.setLastBuildId(request.project_id, request.buildId)
}
```

**2. buildId НЕ передаётся в config:**
```javascript
const queueResult = await CompilationQueueManager.requestCompilation(
  request.project_id,
  request.user_id,
  {
    compiler: request.compiler,
    // ... другие параметры
    // buildId НЕ передаётся!
  },
  request.editorId
)
```

## 📊 Как это работает

### Сценарий 1: Первая компиляция

```
User A → Compile (buildId: "build001")
  ↓
lastBuildId === null → сохранить "build001"
  ↓
projectVersion = 0
configHash = hash({ compiler: "pdflatex", ... })
  ↓
Кэш пуст → запустить компиляцию
  ↓
Результат → states["project123"].compilations.set(configHash, result)
```

### Сценарий 2: Повторная компиляция (без изменений)

```
User A → Compile (buildId: "build001")
  ↓
lastBuildId === "build001" → ничего не менять
  ↓
projectVersion = 0 (не изменилась)
configHash = hash({ ... }) (тот же)
  ↓
Кэш содержит результат → вернуть из кэша мгновенно ✅
```

### Сценарий 3: Компиляция после изменения файлов

```
User A → Редактирует файл
  ↓
Web service генерирует новый buildId: "build002"

User A → Compile (buildId: "build002")
  ↓
lastBuildId === "build001" ≠ "build002"
  ↓
notifyProjectChanged("project123")
  ↓
projectVersion = 1 (инкрементировано!)
compilations.clear() (кэш очищен!)
  ↓
configHash = hash({ ... }) (тот же, но кэш пуст)
  ↓
Запустить новую компиляцию ✅
```

### Сценарий 4: Второй пользователь в том же проекте

```
User A → Compile → результат в кэше

User B → Compile (тот же config)
  ↓
projectVersion = 1 (та же версия проекта)
configHash = hash({ ... }) (тот же config)
  ↓
states["project123"].compilations.get(configHash) → найден!
  ↓
Вернуть результат из кэша ✅
  ↓
User B видит PDF (НЕ 404!) ✅
```

## ✅ Решённые проблемы

| Проблема | Решение |
|----------|---------|
| ❌ User B получает 404 | ✅ Кэш по projectId, результат доступен всем |
| ❌ Изменения не детектируются | ✅ buildId tracking → версия инкрементируется |
| ❌ Кэш не работает | ✅ configHash БЕЗ buildId → стабильный hash |
| ❌ Повторная компиляция медленная | ✅ Результат из кэша → мгновенно |

## 🧪 Тестирование

### Тест 1: Два пользователя

```bash
# 1. User A компилирует
# 2. User B открывает тот же проект → компилирует
# 3. User B должен увидеть PDF (НЕ 404) ✅
```

### Тест 2: Изменения файлов

```bash
# 1. Скомпилировать проект
# 2. Изменить .tex файл
# 3. Recompile
# 4. Должна запуститься НОВАЯ компиляция (не из кэша) ✅
# 5. PDF должен содержать изменения ✅
```

### Тест 3: Повторная компиляция без изменений

```bash
# 1. Скомпилировать проект
# 2. НЕ менять файлы
# 3. Recompile
# 4. Должен вернуться результат из кэша (мгновенно) ✅
```

### Тест 4: Разные настройки

```bash
# 1. Compile с draft=false
# 2. Compile с draft=true
# 3. Две разные компиляции (разный configHash) ✅
```

## 🔍 Логи для отладки

```bash
# Смотреть детекцию изменений
docker logs -f develop-clsi-1 2>&1 | grep -E "buildId|version.*changed"

# Ожидаемые логи при изменении:
# "project files changed, version incremented oldVersion=0 newVersion=1"
```

## 📝 Ключевые понятия

### buildId
- Генерируется Web service
- Меняется при изменении любого файла в проекте
- Используется для **детекции** изменений
- **НЕ** используется для кэширования

### configHash
- Hash настроек компиляции (compiler, draft, stopOnFirstError, ...)
- **НЕ** включает buildId
- Используется как ключ кэша
- Стабилен для одинаковых настроек

### projectVersion
- Инкрементальный номер (1, 2, 3, ...)
- Инкрементируется когда buildId меняется
- При изменении → кэш очищается

## 🎯 Итог

**Архитектура:**
```
Project (projectId)
  ├─ Version: 5
  ├─ LastBuildId: "build123"
  └─ Compilations:
       ├─ configHash1 → Result A (compiler=pdflatex, draft=false)
       ├─ configHash2 → Result B (compiler=xelatex, draft=false)
       └─ configHash3 → Result C (compiler=pdflatex, draft=true)
```

**Для всех пользователей:**
- Одинаковые настройки → один кэш → один результат
- Изменение файлов → новая версия → кэш сброшен
- Разные настройки → разные результаты в кэше

✅ **Правильно и эффективно!**

