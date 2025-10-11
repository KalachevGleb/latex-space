# 🎯 Реализация системы умной очереди компиляций

## ✅ Что реализовано

### 1. CompilationQueueManager (CLSI)
**Файл:** `services/clsi/app/js/CompilationQueueManager.js`

Основной менеджер очереди компиляций с функциями:

- ✅ **Version tracking** - отслеживание изменений проекта
- ✅ **Config-based caching** - кэширование результатов по hash конфигурации
- ✅ **Waiting users list** - несколько пользователей могут ждать одну компиляцию
- ✅ **Smart cancellation** - отмена компиляций при изменениях или отсутствии ожидающих
- ✅ **Event emitter** - уведомления о завершении/ошибках

**Основные методы:**
```javascript
// Запросить компиляцию
await CompilationQueueManager.requestCompilation(
  projectId,
  userId,
  config,
  connectionId
)

// Уведомить о завершении
await CompilationQueueManager.notifyCompilationComplete(projectId, result)

// Уведомить об ошибке
await CompilationQueueManager.notifyCompilationError(projectId, error)

// Обработать отключение пользователя
await CompilationQueueManager.handleUserDisconnected(userId)
```

### 2. Интеграция с CompileManager (CLSI)
**Файл:** `services/clsi/app/js/CompileManager.js`

Модифицирован `doCompileWithLock`:
- ✅ Проверка кэша перед компиляцией
- ✅ Возврат кэшированных результатов
- ✅ Обработка "compile-in-progress" статуса
- ✅ Уведомление о завершении/ошибках

### 3. CompilationNotifier (CLSI)
**Файл:** `services/clsi/app/js/CompilationNotifier.js`

Отправка уведомлений в real-time сервис:
- ✅ Подписка на события от CompilationQueueManager
- ✅ HTTP POST запросы в real-time service
- ✅ Обработка ошибок отправки

### 4. Real-Time Service Integration
**Файлы:**
- `services/real-time/app/js/HttpApiController.js`
- `services/real-time/app/js/Router.js`

Добавлен endpoint:
```
POST /project/:project_id/compilation-update
```

Функции:
- ✅ Приём уведомлений от CLSI
- ✅ Broadcast через WebSocket всем подключённым клиентам проекта

### 5. Frontend Hook (Web)
**Файл:** `services/web/frontend/js/features/ide-react/hooks/use-compilation-updates.ts`

React hook для подписки на WebSocket события:
```typescript
useCompilationUpdates((update) => {
  // Handle compilation-complete, compilation-error, or compilation-cancelled
  console.log('Compilation update:', update)
})
```

## 🔄 Как это работает

### Сценарий 1: Первая компиляция

```
User A запрашивает компиляцию
    ↓
CompilationQueueManager.requestCompilation()
    ↓
Проверка кэша → не найдено
    ↓
Создание runningCompilation с User A в waitingUsers
    ↓
Запуск doCompile()
    ↓
После завершения: notifyCompilationComplete()
    ↓
Сохранение в кэш (compilations Map)
    ↓
CompilationNotifier → HTTP POST → Real-Time Service
    ↓
Real-Time → WebSocket broadcast → User A
    ↓
Frontend получает compilationUpdate event
```

### Сценарий 2: Повторная компиляция (кэш)

```
User A запрашивает ту же компиляцию снова
    ↓
CompilationQueueManager.requestCompilation()
    ↓
Проверка кэша → найден результат!
    ↓
Возврат { status: 'success', fromCache: true, ...result }
    ↓
Мгновенный ответ без запуска компиляции
```

### Сценарий 3: Два пользователя ждут одну компиляцию

```
User A запрашивает компиляцию
    ↓
Компиляция запущена, User A в waitingUsers
    ↓
User B запрашивает ту же компиляцию (тот же config)
    ↓
CompilationQueueManager: та же компиляция уже идёт
    ↓
User B добавлен в waitingUsers
    ↓
Возврат { status: 'compile-in-progress' }
    ↓
После завершения: уведомляются оба (User A и User B)
```

### Сценарий 4: Изменение проекта во время компиляции

```
User A запрашивает компиляцию
    ↓
Компиляция запущена
    ↓
User A вносит изменения в код
    ↓
User A запрашивает новую компиляцию
    ↓
CompilationQueueManager: projectVersion изменилась
    ↓
handleProjectVersionChange():
  - Очистка кэша
  - Удаление User A из waitingUsers старой компиляции
  - Если waitingUsers пуст → отмена старой компиляции
    ↓
Запуск новой компиляции с новой версией
```

### Сценарий 5: Пользователь отключился

```
User A смотрит компиляцию, закрывает вкладку
    ↓
WebSocket disconnect event
    ↓
CompilationQueueManager.handleUserDisconnected(User A)
    ↓
Удаление User A из всех waitingUsers
    ↓
Если waitingUsers пуст → отмена компиляции
```

## 📊 Структуры данных

### ProjectCompilationState
```javascript
{
  projectId: string,
  projectVersion: string,  // hash содержимого
  
  compilations: Map<configHash, result>,  // Кэш результатов
  
  runningCompilation: {
    configHash: string,
    config: object,
    waitingUsers: Set<userId>,
    connections: Map<userId, connectionId>,
    startedBy: userId,
    startedAt: Date
  } | null,
  
  createdAt: Date,
  lastAccessedAt: Date
}
```

### CompilationUpdate (WebSocket event)
```typescript
{
  type: 'compilation-complete' | 'compilation-error' | 'compilation-cancelled',
  userId: string,
  configHash: string,
  
  // For 'compilation-complete':
  status: 'success',
  outputFiles: [...],
  buildId: string,
  stats: {...},
  
  // For 'compilation-error':
  error: string,
  
  // For 'compilation-cancelled':
  reason: string
}
```

## 🧪 Тестирование

### Тест 1: Проверка кэширования
```bash
# Запустить dev environment
./develop/bin/dev

# В browser:
1. Открыть проект
2. Нажать "Recompile" → компиляция запущена
3. Дождаться завершения
4. Нажать "Recompile" снова → мгновенный результат из кэша
```

### Тест 2: Concurrent compilation
```bash
# В двух вкладках одновременно:
Tab 1: Открыть проект, нажать "Recompile"
Tab 2: Открыть тот же проект, сразу нажать "Recompile"

Ожидание: 
- Только одна компиляция запущена
- Оба пользователя получают результат одновременно
```

### Тест 3: Изменение проекта
```bash
1. Запустить компиляцию (долгий проект)
2. Пока компилируется, изменить код
3. Нажать "Recompile" снова

Ожидание:
- Старая компиляция отменена (если только вы ждёте)
- Новая компиляция запущена
- Кэш очищен
```

## 📈 Метрики

CompilationQueueManager отправляет метрики:

- `compilation-cache-hit` - попадание в кэш
- `compilation-joined` - присоединение к существующей компиляции
- `compilation-queued` - постановка в очередь
- `compilation-started` - начало компиляции
- `compilation-completed` - успешное завершение
- `compilation-failed` - ошибка компиляции
- `compilation-cancelled` - отмена компиляции
- `project-version-changed` - изменение версии проекта
- `active-compilations` (gauge) - количество активных компиляций
- `compilation-states-count` (gauge) - количество отслеживаемых проектов

## 🔧 Конфигурация

### Отключение новой системы

Если нужно вернуться к старому поведению, можно временно отключить интеграцию:

В `services/clsi/app/js/CompileManager.js`:
```javascript
// Закомментировать строки с CompilationQueueManager
// const queueResult = await CompilationQueueManager.requestCompilation(...)
// Оставить только:
const lock = LockManager.acquire(compileDir)
try {
  return await doCompile(request, stats, timings)
} finally {
  lock.release()
}
```

### Настройка TTL кэша

В `CompilationQueueManager.js`, метод `_cleanupExpiredStates`:
```javascript
const expiryTime = 60 * 60 * 1000 // 1 hour (можно изменить)
```

## 🚀 Что дальше?

### Опционально (не реализовано):

1. **Redis persistence** - для сохранения состояния между перезапусками
2. **Полная замена LockManager** - интеграция lock внутрь QueueManager
3. **Priority queues** - приоритизация компиляций по типу пользователя
4. **Rate limiting per user** - ограничение частоты компиляций
5. **Advanced metrics** - детальная статистика использования

### Для production:

1. ✅ Логи уже настроены
2. ⚠️ Добавить мониторинг метрик
3. ⚠️ Настроить alerts на ошибки уведомлений
4. ⚠️ Load testing с множеством пользователей
5. ⚠️ Настроить Redis для persistence (если нужно)

## 📝 Примечания

- Система работает в **in-memory** режиме (без Redis)
- При перезапуске CLSI все состояния теряются
- Frontend hook создан, но не полностью интегрирован в UI
- Backward compatible - старые клиенты продолжат работать

## 🐛 Известные ограничения

1. **In-memory storage** - состояние не персистентно
2. **Single-instance** - не работает с несколькими CLSI инстансами
3. **Frontend integration** - hook создан, но нужна интеграция в UI
4. **Error recovery** - если real-time service недоступен, уведомления теряются

## 🎉 Итог

Базовая архитектура умной очереди компиляций **реализована и готова к тестированию**!

Основные преимущества:
- ✅ Кэширование результатов по конфигурации
- ✅ Переиспользование компиляций между пользователями
- ✅ Автоматическая отмена при изменениях
- ✅ WebSocket уведомления в real-time
- ✅ Метрики для мониторинга

Следующий шаг: **тестирование и отладка**!

