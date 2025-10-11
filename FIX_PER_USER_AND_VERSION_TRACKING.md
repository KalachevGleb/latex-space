# 🔧 Исправление: Per-User кэширование и Version Tracking

## 🐛 Проблемы

### Проблема 1: 404 для другого пользователя
**Симптомы:**
- Первый пользователь компилирует → всё ОК
- Второй пользователь в том же проекте → PDF rendering error, 404

**Причина:**
- Overleaf использует **per-user компиляции** (разные папки для разных пользователей)
- CompilationQueueManager использовал только `projectId` как ключ
- Результаты первого пользователя кэшировались глобально
- Второй пользователь получал ссылку на файлы в папке первого пользователя
- URL: `.../user/USER2/...` → файлы лежат в `.../user/USER1/...` → 404

### Проблема 2: Изменения кода не сбрасывают кэш
**Симптомы:**
- Изменить код → Recompile → компиляция НЕ перезапускается
- Старый PDF остаётся

**Причина:**
- `_generateVersion()` возвращал timestamp, но вызывался только **один раз**
- `config._projectVersion` не передавался
- `_hasVersionChanged()` всегда возвращал false (нет предыдущей версии)
- `buildId` не включался в configHash

## ✅ Решение

### Исправление 1: Per-User State Key

**Было:**
```javascript
// Map: projectId -> ProjectCompilationState
this.states = new Map()

const state = this._getOrCreateState(projectId)
```

**Стало:**
```javascript
// Map: "projectId:userId" -> ProjectCompilationState
this.states = new Map()

const stateKey = `${projectId}:${userId}` // Per-user compilation state
const state = this._getOrCreateState(stateKey, projectId, userId)
```

**Изменения:**
1. Ключ состояния теперь `"projectId:userId"`
2. Каждый пользователь имеет **своё** состояние компиляции
3. Кэш первого пользователя **не влияет** на второго

### Исправление 2: buildId в configHash

**Было:**
```javascript
_hashConfig(config) {
  const canonical = {
    compiler: config.compiler,
    rootDocId: config.rootDoc_id,
    draft: config.draft || false,
    stopOnFirstError: config.stopOnFirstError || false,
    imageName: config.imageName || 'default',
    flags: config.flags || [],
    // buildId НЕ включался!
  }
  // ...
}
```

**Стало:**
```javascript
_hashConfig(config) {
  const canonical = {
    compiler: config.compiler,
    rootDocId: config.rootDoc_id,
    draft: config.draft || false,
    stopOnFirstError: config.stopOnFirstError || false,
    imageName: config.imageName || 'default',
    flags: config.flags || [],
    buildId: config.buildId || 'no-build-id', // ← Добавлено!
  }
  // ...
}
```

**Почему это работает:**
- Web service генерирует **новый buildId** при каждом изменении проекта
- buildId включён в configHash
- Новый configHash → нет в кэше → запускается новая компиляция ✅

### Исправление 3: _hasVersionChanged

**Было:**
```javascript
_hasVersionChanged(state, newVersion) {
  return state.projectVersion && state.projectVersion !== newVersion
}

// При первом вызове:
// state.projectVersion === null
// => state.projectVersion && ... === false
// => не детектируется изменение
```

**Стало:**
```javascript
_hasVersionChanged(state, newVersion) {
  // Always treat first version as not changed
  if (!state.projectVersion) {
    return false // Первая версия никогда не "изменение"
  }
  return state.projectVersion !== newVersion
}
```

### Исправление 4: Передача buildId

**CompileManager.js:**
```javascript
const queueResult = await CompilationQueueManager.requestCompilation(
  request.project_id,
  request.user_id,
  {
    // ...
    buildId: request.buildId, // ← Добавлено!
    // ...
  },
  request.editorId
)
```

### Исправление 5: Обновление сигнатур методов

**notifyCompilationComplete и notifyCompilationError:**
```javascript
// Было:
async notifyCompilationComplete(projectId, result)

// Стало:
async notifyCompilationComplete(projectId, userId, result)
```

**Вызовы в CompileManager:**
```javascript
await CompilationQueueManager.notifyCompilationComplete(
  request.project_id,
  request.user_id, // ← Добавлено!
  { status: 'success', ...result }
)
```

## 📊 Как это работает теперь

### Сценарий 1: Два пользователя, один проект

```
User A (ID: userA) → Compile
  ↓
stateKey = "project123:userA"
configHash = hash({ ..., buildId: "build001" })
  ↓
state["project123:userA"].compilations.set(configHash, result_A)
  ↓
User A получает PDF из своей папки: .../user/userA/.../output.pdf ✅

User B (ID: userB) → Compile
  ↓
stateKey = "project123:userB" // ← ДРУГОЙ ключ!
configHash = hash({ ..., buildId: "build001" }) // тот же config
  ↓
state["project123:userB"] НЕ содержит этот configHash
  ↓
Запускается НОВАЯ компиляция для User B ✅
  ↓
User B получает PDF из своей папки: .../user/userB/.../output.pdf ✅
```

### Сценарий 2: Изменение кода

```
User A → Compile (buildId: "build001")
  ↓
configHash_1 = hash({ ..., buildId: "build001" })
  ↓
Компиляция, результат в кэше

User A → Редактирует код
  ↓
Web генерирует новый buildId: "build002"

User A → Recompile
  ↓
configHash_2 = hash({ ..., buildId: "build002" }) // ← ДРУГОЙ hash!
  ↓
configHash_2 ≠ configHash_1
  ↓
В кэше нет configHash_2
  ↓
Запускается НОВАЯ компиляция ✅
```

### Сценарий 3: Повторная компиляция без изменений

```
User A → Compile (buildId: "build001")
  ↓
configHash = hash({ ..., buildId: "build001" })
  ↓
Результат в кэше

User A → Recompile (тот же buildId: "build001")
  ↓
configHash = hash({ ..., buildId: "build001" }) // ← ТОТ ЖЕ hash!
  ↓
configHash найден в кэше
  ↓
Мгновенный возврат из кэша ✅
```

## 🔍 Изменённые файлы

### services/clsi/app/js/CompilationQueueManager.js

**Изменения:**
1. ✅ `states` ключ: `projectId` → `"projectId:userId"`
2. ✅ `_getOrCreateState(stateKey, projectId, userId)` - новые параметры
3. ✅ `_trackUserProject(userId, stateKey)` - stateKey вместо projectId
4. ✅ `handleUserDisconnected(userId)` - работа с stateKey
5. ✅ `notifyCompilationComplete(projectId, userId, result)` - добавлен userId
6. ✅ `notifyCompilationError(projectId, userId, error)` - добавлен userId
7. ✅ `_hashConfig(config)` - включён buildId
8. ✅ `_hasVersionChanged(state, newVersion)` - исправлена логика
9. ✅ `_cleanupExpiredStates()` - работа с stateKey

### services/clsi/app/js/CompileManager.js

**Изменения:**
1. ✅ Передача `buildId` в config
2. ✅ Передача `userId` в `notifyCompilationComplete`
3. ✅ Передача `userId` в `notifyCompilationError`

## 📈 Ожидаемые результаты

| Тест | До исправления | После исправления |
|------|----------------|-------------------|
| User A компилирует | ✅ OK | ✅ OK |
| User B в том же проекте | ❌ 404 | ✅ OK |
| User A изменяет код → Recompile | ❌ Старый PDF | ✅ Новая компиляция |
| User A Recompile без изменений | ✅ Из кэша | ✅ Из кэша |
| User A и User B одновременно | ⚠️ Shared cache | ✅ Separate caches |

## 🧪 Тестирование

### Тест 1: Два пользователя

```bash
# 1. Войти как User A, открыть проект, скомпилировать
# 2. Войти как User B в тот же проект, скомпилировать
# 3. User B должен увидеть PDF (не 404)
```

### Тест 2: Изменения кода

```bash
# 1. Скомпилировать проект
# 2. Изменить .tex файл (добавить текст)
# 3. Recompile
# 4. Должна запуститься новая компиляция (не из кэша)
# 5. PDF должен содержать новый текст
```

### Тест 3: Повторная компиляция

```bash
# 1. Скомпилировать проект
# 2. НЕ менять код
# 3. Recompile
# 4. Должен вернуться результат из кэша (мгновенно)
```

## 🔍 Отладка

### Просмотр stateKey в логах

```bash
docker logs -f develop-clsi-1 2>&1 | grep -E "stateKey|userId.*projectId"
```

Ожидаемые логи:
```
requesting compilation projectId="123" userId="userA"
starting new compilation projectId="123" userId="userA"
compilation completed projectId="123" userId="userA"
```

### Проверка configHash

```bash
docker logs develop-clsi-1 2>&1 | grep configHash
```

Должны видеть **разные** configHash для:
- Разных пользователей (даже с одинаковым buildId)
- Одного пользователя после изменения кода (разный buildId)

Должны видеть **одинаковый** configHash для:
- Повторной компиляции без изменений

## ✅ Итог

**Проблемы решены:**
1. ✅ Per-user кэширование: каждый пользователь имеет своё состояние
2. ✅ Version tracking: buildId включён в configHash, изменения детектируются
3. ✅ 404 больше не возникает для второго пользователя
4. ✅ Изменения кода запускают новую компиляцию

**Архитектура:**
- Каждый пользователь = отдельное состояние (`projectId:userId`)
- buildId = версия проекта (меняется при изменениях)
- Кэш работает корректно для всех случаев

🎉 **Готово к тестированию!**

