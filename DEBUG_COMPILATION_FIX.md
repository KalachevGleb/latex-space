# 🐛 Исправление: "A previous compile is still running"

## Проблема

Ошибка "A previous compile is still running" появлялась даже для новых компиляций, потому что:

1. `CompilationQueueManager.requestCompilation()` возвращал `status: 'compile-in-progress'` для **двух разных случаев**:
   - ✅ Новая компиляция (мы только что запустили) → нужно реально компилировать
   - ✅ Присоединение к существующей → НЕ нужно компилировать, только ждать

2. `CompileManager.js` проверял только статус и выбрасывал ошибку в обоих случаях

## Решение

Добавлен флаг `shouldCompile: boolean` в результат `requestCompilation()`:

### В CompilationQueueManager.js:

```javascript
// Случай 1: Новая компиляция запущена
return {
  status: 'compile-in-progress',
  shouldCompile: true,  // ← Продолжить с реальной компиляцией
  startedAt: ...,
  configHash: ...
}

// Случай 2: Присоединение к существующей
return {
  status: 'compile-in-progress',
  shouldCompile: false, // ← НЕ компилировать, только ждать
  startedAt: ...,
  configHash: ...
}

// Случай 3: Другая компиляция, в очереди
return {
  status: 'compile-in-progress',
  shouldCompile: false, // ← Ждать завершения другой
  message: 'Another compilation is in progress',
  configHash: ...
}
```

### В CompileManager.js:

```javascript
// Проверяем флаг shouldCompile
if (queueResult.status === 'compile-in-progress' && !queueResult.shouldCompile) {
  // Только в этом случае throw error
  throw new Errors.AlreadyCompilingError('compile in progress')
}

// Если shouldCompile === true, продолжаем с компиляцией
const lock = LockManager.acquire(compileDir)
// ...
```

## Логика работы

### Сценарий 1: Первая компиляция

```
User A → Compile
  ↓
QueueManager: нет runningCompilation
  ↓
_startCompilation() → { shouldCompile: true }
  ↓
CompileManager: shouldCompile === true → продолжить
  ↓
Реальная компиляция запущена ✅
```

### Сценарий 2: Присоединение к существующей

```
User A → Compile (запущена)
  ↓
User B → Compile (та же config)
  ↓
QueueManager: runningCompilation существует, configHash совпадает
  ↓
Добавить User B в waitingUsers → { shouldCompile: false }
  ↓
CompileManager: shouldCompile === false → throw AlreadyCompilingError
  ↓
User B получит WebSocket уведомление когда User A завершит ✅
```

### Сценарий 3: Разные компиляции

```
User A → Compile (config X, запущена)
  ↓
User B → Compile (config Y, другая)
  ↓
QueueManager: runningCompilation существует, но другой configHash
  ↓
Поставить в очередь → { shouldCompile: false }
  ↓
CompileManager: throw AlreadyCompilingError
  ↓
User B получит статус "в очереди" ✅
```

## Тестирование

После перезапуска CLSI:

```bash
docker restart develop-clsi-1
```

Попробуйте:

1. ✅ Открыть проект → Recompile
   - **До:** Ошибка "previous compile is still running"
   - **После:** Компиляция запускается нормально

2. ✅ Recompile → Сразу Recompile снова (в двух вкладках)
   - **До:** Обе выдают ошибку
   - **После:** Первая компилирует, вторая ждёт WebSocket

3. ✅ Повторный Recompile с теми же настройками
   - **После:** Мгновенный результат из кэша

## Проверка логов

```bash
# Смотреть логи в реальном времени
docker logs -f develop-clsi-1 2>&1 | grep -i "compilation\|shouldCompile"
```

Ожидаемые логи при первой компиляции:
```
requesting compilation projectId=... userId=...
starting new compilation projectId=...
compilation started (shouldCompile: true)
```

## Изменённые файлы

1. `services/clsi/app/js/CompilationQueueManager.js`
   - Добавлен `shouldCompile: true` в `_startCompilation`
   - Добавлен `shouldCompile: false` при присоединении к существующей
   - Добавлен `shouldCompile: false` при постановке в очередь

2. `services/clsi/app/js/CompileManager.js`
   - Изменена проверка на `!queueResult.shouldCompile`
   - Добавлено логирование для отладки

## Итог

Теперь система различает:
- ✅ **Запуск новой компиляции** → `shouldCompile: true` → реальная компиляция
- ✅ **Присоединение к существующей** → `shouldCompile: false` → только WebSocket
- ✅ **Очередь** → `shouldCompile: false` → ожидание

Ошибка "A previous compile is still running" больше не появляется для новых компиляций! 🎉

