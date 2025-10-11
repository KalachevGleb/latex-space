# 🔄 Функция: Force Recompile (Перекомпиляция с нуля)

## 🎯 Назначение

Режим "Recompile from scratch" позволяет принудительно запустить компиляцию с нуля, игнорируя кэш. Это полезно когда:

- Нужно обновить даты в документе (например, `\today`)
- Нужно сбросить временные файлы компиляции
- Нужна гарантированно "чистая" сборка перед финальной версией

## ✨ Особенности

### 1. Игнорирование кэша
- Force компиляция **НЕ** использует закэшированный результат
- Всегда запускается реальная компиляция

### 2. Очистка временных файлов
- Перед компиляцией удаляются все временные файлы (`.aux`, `.log`, и т.д.)
- Компиляция выполняется в чистом окружении

### 3. Обновление кэша
- После успешной force компиляции результат **сохраняется** в кэш
- Последующие обычные компиляции будут использовать этот обновлённый результат

### 4. Умное ожидание
- Если другой пользователь **уже запустил** force компиляцию с теми же настройками
- Остальные пользователи **присоединяются** к ожиданию (не запускают дублирующую компиляцию)
- Все получают результат одновременно

## 🔧 Реализация

### 1. RequestParser.js

Добавлен флаг `force`:

```javascript
response.force = _parseAttribute(
  'force',
  compile.options.force,
  {
    default: false,
    type: 'boolean',
  }
)
```

### 2. CompileManager.js

**Очистка временных файлов:**
```javascript
// If force recompile, clear temporary files
if (request.force) {
  logger.info(
    { projectId: request.project_id, userId: request.user_id },
    'force recompile requested, clearing temporary files'
  )
  await clearProject(request.project_id, request.user_id)
}
```

**Передача флага в очередь:**
```javascript
const queueResult = await CompilationQueueManager.requestCompilation(
  request.project_id,
  request.user_id,
  {
    // ... other config
    force: request.force || false,
  },
  request.editorId
)
```

**Игнорирование кэша:**
```javascript
// If from cache and not force, return immediately
if (queueResult.fromCache && !request.force) {
  return queueResult
}

// If force recompile but result from cache, ignore cache
if (queueResult.fromCache && request.force) {
  logger.info('ignoring cache due to force recompile')
  // Fall through to check if compilation is running
}
```

### 3. CompilationQueueManager.js

**Игнорирование кэша при проверке:**
```javascript
// Check for cached result (unless force recompile)
const cached = state.compilations.get(configHash)
if (cached && cached.status === 'success' && !config.force) {
  return {
    status: 'success',
    fromCache: true,
    ...cached,
  }
}

// If force recompile and cached result exists, clear it
if (config.force && cached) {
  logger.info('force recompile: clearing cached result')
  state.compilations.delete(configHash)
}
```

**Присоединение к существующей компиляции:**
```javascript
// Check if compilation is already running with same config
if (state.runningCompilation && state.runningCompilation.configHash === configHash) {
  // Even if force=true, join existing compilation (don't start duplicate)
  logger.debug({ force: config.force || false }, 'joining existing compilation')
  
  // Add user to waiting list
  state.runningCompilation.waitingUsers.add(userId)
  
  return {
    status: 'compile-in-progress',
    shouldCompile: false, // Wait for existing compilation
  }
}
```

**Важно:** `force` **НЕ** включается в `configHash`:
```javascript
_hashConfig(config) {
  // NOTE: Do NOT include force - it's a trigger, not part of config
  //       (force compilations should use same cache key and join running compilations)
  const canonical = {
    compiler: config.compiler,
    rootDocId: config.rootDoc_id,
    // ... other fields
    // НЕТ force здесь!
  }
  return hash(canonical)
}
```

## 🎬 Сценарии использования

### Сценарий 1: Обычная force компиляция

```
User A → Force Recompile
  ↓
Очистка временных файлов (clearProject)
  ↓
Удаление из кэша (state.compilations.delete)
  ↓
Запуск компиляции
  ↓
Сохранение в кэш
  ↓
User A получает обновлённый PDF ✅
```

### Сценарий 2: Force компиляция во время обычной

```
User A → Compile (обычная, идёт...)
  ↓
User B → Force Recompile
  ↓
configHash одинаковый → присоединиться к User A
  ↓
Ждать завершения компиляции User A
  ↓
Оба получают результат одновременно ✅
```

### Сценарий 3: Две force компиляции одновременно

```
User A → Force Recompile (первый)
  ↓
Очистка кэша → Запуск компиляции
  ↓
User B → Force Recompile (пока User A компилирует)
  ↓
configHash одинаковый → присоединиться к User A
  ↓
НЕ запускать вторую компиляцию!
  ↓
Оба получают результат одновременно ✅
```

### Сценарий 4: Force → обычная компиляция

```
User A → Force Recompile
  ↓
Компиляция → Сохранение в кэш
  ↓
User B → Compile (обычная)
  ↓
Проверка кэша → результат есть
  ↓
User B получает из кэша мгновенно ✅
```

## 📊 API

### Запрос

```json
POST /project/{project_id}/compile

{
  "compile": {
    "options": {
      "compiler": "pdflatex",
      "force": true  // ← Force recompile
    },
    "rootDoc_id": "...",
    "resources": [...]
  }
}
```

### Ответ (успешная компиляция)

```json
{
  "compile": {
    "status": "success",
    "outputFiles": [...],
    "buildId": "..."
  }
}
```

### Ответ (присоединение к существующей)

Если компиляция уже идёт, возвращается HTTP 423:
```json
{
  "compile": {
    "status": "compile-in-progress",
    "error": "compile in progress"
  }
}
```

Frontend затем получит результат через WebSocket `compilationUpdate`.

## 🔍 Логирование

### Force компиляция запущена:
```json
{
  "level": "info",
  "msg": "force recompile requested, clearing temporary files",
  "projectId": "...",
  "userId": "..."
}
```

### Кэш очищен:
```json
{
  "level": "info",
  "msg": "force recompile: clearing cached result",
  "projectId": "...",
  "configHash": "..."
}
```

### Запуск компиляции:
```json
{
  "level": "info",
  "msg": "starting force recompile (from scratch)",
  "projectId": "...",
  "userId": "...",
  "configHash": "...",
  "force": true
}
```

### Присоединение к существующей:
```json
{
  "level": "debug",
  "msg": "joining existing compilation",
  "projectId": "...",
  "configHash": "...",
  "force": true
}
```

## 🧪 Тестирование

### Тест 1: Force обновляет дату

1. Создать документ с `\today`
2. Скомпилировать (дата = 11 октября)
3. Подождать до следующего дня
4. Обычная компиляция → дата НЕ обновилась (из кэша)
5. Force Recompile → дата обновилась! ✅

### Тест 2: Force очищает временные файлы

```bash
# 1. Compile
ls compiles/projectId/
# Файлы: main.tex, main.aux, main.log

# 2. Force Recompile
# Проверить логи:
docker logs -f develop-clsi-1 | grep "clearing temporary files"

# 3. Проверить что файлы очищены
ls compiles/projectId/
# Файлы: main.tex (aux, log удалены перед компиляцией)
```

### Тест 3: Присоединение к force компиляции

```bash
# User A: Force Recompile (долгий документ)
# User B: Сразу Force Recompile

# Проверить логи:
docker logs -f develop-clsi-1 | grep "joining existing"

# Ожидание: только одна компиляция запущена ✅
```

### Тест 4: Кэш обновляется после force

```bash
# 1. User A: Force Recompile
# 2. User B: Обычная Compile

# Проверить логи User B:
# "returning cached compilation result"

# Ожидание: User B получает обновлённый результат из кэша ✅
```

## ⚠️ Важные моменты

### 1. Force не меняет configHash
- Force компиляция с теми же настройками имеет **тот же** configHash
- Это позволяет присоединяться к существующей компиляции

### 2. Один результат для всех
- После force компиляции результат сохраняется в общий кэш
- Все пользователи с теми же настройками видят обновлённый результат

### 3. Нет дублирующих компиляций
- Если force компиляция уже идёт, новые запросы присоединяются к ней
- Это экономит ресурсы и предотвращает race conditions

### 4. Очистка per-project
- Временные файлы очищаются для всего проекта
- Это правильно, т.к. output теперь per-project (не per-user)

## ✅ Преимущества

| Аспект | Обычная компиляция | Force Recompile |
|--------|-------------------|-----------------|
| Использует кэш | ✅ Да | ❌ Нет |
| Очищает временные файлы | ❌ Нет | ✅ Да |
| Обновляет даты | ❌ Нет | ✅ Да |
| Гарантирует чистую сборку | ❌ Нет | ✅ Да |
| Обновляет кэш | ✅ Да | ✅ Да |
| Присоединяется к существующей | ✅ Да | ✅ Да |

## 📝 Итог

**Force Recompile** - это "умная" принудительная перекомпиляция:
- ✅ Игнорирует кэш
- ✅ Очищает временные файлы
- ✅ Обновляет результат в кэше
- ✅ Не создаёт дублирующих компиляций
- ✅ Все пользователи получают обновлённый результат

**Готово к использованию!** 🎉

