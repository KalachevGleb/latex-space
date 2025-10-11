# 🏗️ Архитектура: Очередь компиляций с умным кэшированием

## 📖 Проблема

**Текущая архитектура:**
- Простой лок на `compileDir`
- Нет отслеживания версий проекта
- Нет кэша результатов по настройкам
- Перезагрузка страницы = ошибка "compilation already running"

**Желаемое поведение:**
1. Отслеживание версии состояния проекта
2. Map: `CompileConfig → CompilationResult`
3. Список пользователей, ожидающих компиляцию
4. Умная логика запуска/остановки/переиспользования

## 🎯 Архитектура решения

### 1. Структуры данных

```typescript
// Версия проекта (hash содержимого)
interface ProjectVersion {
  hash: string  // SHA256 of all files content
  lastUpdated: Date
  docs: Map<DocId, DocHash>
}

// Конфигурация компиляции
interface CompileConfig {
  compiler: 'pdflatex' | 'xelatex' | 'lualatex' | 'latex'
  rootDocId: string
  draft: boolean
  stopOnFirstError: boolean
  imageName?: string
  // ... другие параметры
}

// Результат компиляции
type CompilationResult =
  | { status: 'running'; startedAt: Date; progress?: number }
  | { status: 'completed'; pdf: Buffer; logs: string[]; outputFiles: File[] }
  | { status: 'failed'; error: Error; logs: string[] }

// Состояние компиляции проекта
interface ProjectCompilationState {
  projectId: string
  projectVersion: ProjectVersion
  
  // Map: config hash → результат компиляции
  compilations: Map<string, CompilationResult>
  
  // Текущая запущенная компиляция
  runningCompilation?: {
    configHash: string
    config: CompileConfig
    process: ChildProcess
    waitingUsers: Set<UserId>
    startedBy: UserId
    startedAt: Date
  }
  
  // История компиляций (для отладки)
  history: CompilationHistoryEntry[]
}

// Пользователь, ожидающий компиляцию
interface WaitingUser {
  userId: string
  connectionId: string  // WebSocket connection ID
  requestedAt: Date
  configHash: string
}
```

### 2. API компиляции

```typescript
class CompilationQueueManager {
  private states: Map<ProjectId, ProjectCompilationState> = new Map()
  
  /**
   * Главный метод: запросить компиляцию
   */
  async requestCompilation(
    projectId: string,
    userId: string,
    config: CompileConfig,
    connectionId: string
  ): Promise<CompilationResult> {
    const state = await this.getOrCreateState(projectId)
    const currentVersion = await this.getProjectVersion(projectId)
    const configHash = this.hashConfig(config)
    
    // 1. Проверка: изменился ли проект?
    if (!this.isSameVersion(state.projectVersion, currentVersion)) {
      await this.handleProjectChanged(state, currentVersion, userId)
    }
    
    // 2. Есть ли готовый результат для этой конфигурации?
    const cached = state.compilations.get(configHash)
    if (cached && cached.status === 'completed') {
      return cached  // Возвращаем кэшированный результат
    }
    
    // 3. Уже запущена компиляция с этой конфигурацией?
    if (
      state.runningCompilation &&
      state.runningCompilation.configHash === configHash
    ) {
      // Подписываемся на результат
      state.runningCompilation.waitingUsers.add(userId)
      await this.registerWaiter(connectionId, projectId, configHash)
      return { status: 'running', startedAt: state.runningCompilation.startedAt }
    }
    
    // 4. Запущена компиляция с другой конфигурацией?
    if (state.runningCompilation) {
      const otherConfig = state.runningCompilation
      
      // 4a. Это тот же пользователь?
      if (otherConfig.startedBy === userId) {
        // Отменяем старую, запускаем новую
        await this.cancelCompilation(state, 'user-requested-new-config')
      }
      // 4b. Другой пользователь?
      else {
        // Запускаем параллельно (если позволяют ресурсы)
        // или ставим в очередь
        return await this.queueOrRunParallel(state, config, userId, connectionId)
      }
    }
    
    // 5. Запускаем новую компиляцию
    return await this.startCompilation(state, config, userId, connectionId)
  }
  
  /**
   * Обработка изменения проекта
   */
  private async handleProjectChanged(
    state: ProjectCompilationState,
    newVersion: ProjectVersion,
    userId: string
  ): Promise<void> {
    // Проект изменился - сбрасываем кэш
    state.projectVersion = newVersion
    state.compilations.clear()
    
    // Отменяем текущую компиляцию, если никто её не ждёт
    // ИЛИ ждущие пользователи не включают того, кто внёс изменения
    if (state.runningCompilation) {
      state.runningCompilation.waitingUsers.delete(userId)
      
      if (state.runningCompilation.waitingUsers.size === 0) {
        await this.cancelCompilation(state, 'project-changed')
      }
    }
  }
  
  /**
   * Запуск компиляции
   */
  private async startCompilation(
    state: ProjectCompilationState,
    config: CompileConfig,
    userId: string,
    connectionId: string
  ): Promise<CompilationResult> {
    const configHash = this.hashConfig(config)
    
    // Создаём запись о компиляции
    state.runningCompilation = {
      configHash,
      config,
      process: null as any,  // будет установлен ниже
      waitingUsers: new Set([userId]),
      startedBy: userId,
      startedAt: new Date()
    }
    
    // Запускаем процесс компиляции
    const process = await this.launchCompileProcess(state.projectId, config)
    state.runningCompilation.process = process
    
    // Регистрируем события
    process.on('complete', (result) => {
      this.handleCompilationComplete(state, configHash, result)
    })
    
    process.on('error', (error) => {
      this.handleCompilationError(state, configHash, error)
    })
    
    // Возвращаем статус "running"
    return {
      status: 'running',
      startedAt: state.runningCompilation.startedAt
    }
  }
  
  /**
   * Завершение компиляции
   */
  private async handleCompilationComplete(
    state: ProjectCompilationState,
    configHash: string,
    result: CompilationResult
  ): Promise<void> {
    // Сохраняем результат в кэш
    state.compilations.set(configHash, result)
    
    // Уведомляем всех ожидающих пользователей
    if (state.runningCompilation) {
      const waitingUsers = Array.from(state.runningCompilation.waitingUsers)
      
      for (const userId of waitingUsers) {
        await this.notifyUser(userId, result)
      }
      
      // Очищаем запущенную компиляцию
      state.runningCompilation = undefined
    }
    
    // Добавляем в историю
    state.history.push({
      configHash,
      completedAt: new Date(),
      status: 'completed'
    })
  }
  
  /**
   * Отмена компиляции
   */
  private async cancelCompilation(
    state: ProjectCompilationState,
    reason: string
  ): Promise<void> {
    if (!state.runningCompilation) return
    
    // Убиваем процесс
    state.runningCompilation.process.kill('SIGTERM')
    
    // Уведомляем ожидающих
    for (const userId of state.runningCompilation.waitingUsers) {
      await this.notifyUser(userId, {
        status: 'cancelled',
        reason
      })
    }
    
    state.runningCompilation = undefined
  }
  
  /**
   * Пользователь отключился
   */
  async handleUserDisconnected(
    userId: string,
    projectId: string
  ): Promise<void> {
    const state = this.states.get(projectId)
    if (!state || !state.runningCompilation) return
    
    // Удаляем из списка ожидающих
    state.runningCompilation.waitingUsers.delete(userId)
    
    // Если никто не ждёт - отменяем компиляцию
    if (state.runningCompilation.waitingUsers.size === 0) {
      await this.cancelCompilation(state, 'no-waiting-users')
    }
  }
  
  /**
   * Вычисление версии проекта
   */
  private async getProjectVersion(projectId: string): Promise<ProjectVersion> {
    // Получаем все документы проекта
    const docs = await this.getAllDocs(projectId)
    
    // Создаём hash каждого документа
    const docHashes = new Map()
    for (const [docId, content] of docs) {
      docHashes.set(docId, this.hashContent(content))
    }
    
    // Общий hash проекта
    const allHashes = Array.from(docHashes.values()).sort().join(',')
    const projectHash = this.hashContent(allHashes)
    
    return {
      hash: projectHash,
      lastUpdated: new Date(),
      docs: docHashes
    }
  }
  
  /**
   * Hash конфигурации компиляции
   */
  private hashConfig(config: CompileConfig): string {
    const canonical = JSON.stringify(config, Object.keys(config).sort())
    return crypto.createHash('sha256').update(canonical).digest('hex')
  }
  
  /**
   * Уведомление пользователя через WebSocket
   */
  private async notifyUser(userId: string, result: any): Promise<void> {
    const connection = this.connections.get(userId)
    if (connection) {
      connection.send(JSON.stringify({
        type: 'compilation-result',
        result
      }))
    }
  }
}
```

### 3. Frontend интеграция

```typescript
// WebSocket подписка на результаты
class CompilationSubscriber {
  private ws: WebSocket
  private pendingCompilations: Map<string, Promise<CompilationResult>> = new Map()
  
  async requestCompilation(
    projectId: string,
    config: CompileConfig
  ): Promise<CompilationResult> {
    const configHash = this.hashConfig(config)
    
    // Проверяем, не ожидаем ли мы уже эту компиляцию
    if (this.pendingCompilations.has(configHash)) {
      return this.pendingCompilations.get(configHash)!
    }
    
    // Создаём Promise, который разрешится когда придёт результат
    const promise = new Promise<CompilationResult>((resolve, reject) => {
      // Отправляем запрос
      this.ws.send(JSON.stringify({
        type: 'request-compilation',
        projectId,
        config
      }))
      
      // Регистрируем callback для результата
      this.registerCallback(configHash, resolve, reject)
    })
    
    this.pendingCompilations.set(configHash, promise)
    return promise
  }
  
  private handleMessage(message: any) {
    if (message.type === 'compilation-result') {
      const configHash = message.configHash
      const callback = this.callbacks.get(configHash)
      
      if (callback) {
        callback.resolve(message.result)
        this.pendingCompilations.delete(configHash)
        this.callbacks.delete(configHash)
      }
    }
  }
}
```

### 4. Хранение состояния

**Опции:**

#### Вариант A: Redis (рекомендуется для production)
```typescript
class RedisCompilationStateStore {
  async getState(projectId: string): Promise<ProjectCompilationState> {
    const key = `compile:state:${projectId}`
    const json = await redis.get(key)
    return JSON.parse(json)
  }
  
  async setState(projectId: string, state: ProjectCompilationState): Promise<void> {
    const key = `compile:state:${projectId}`
    await redis.set(key, JSON.stringify(state), 'EX', 3600)  // 1 hour TTL
  }
  
  async subscribeToResults(projectId: string, callback: Function): Promise<void> {
    const channel = `compile:results:${projectId}`
    await redis.subscribe(channel, callback)
  }
}
```

#### Вариант B: In-memory с репликацией (для dev)
```typescript
class InMemoryStateStore {
  private states: Map<string, ProjectCompilationState> = new Map()
  
  // Синхронизация между инстансами через Redis pub/sub
  async broadcastStateChange(projectId: string, state: ProjectCompilationState) {
    await redis.publish('compile:state:update', JSON.stringify({
      projectId,
      state
    }))
  }
}
```

### 5. Миграция с текущей архитектуры

**Этап 1: Добавить version tracking**
- Вычислять hash проекта перед каждой компиляцией
- Сбрасывать кэш при изменениях

**Этап 2: Добавить config-based caching**
- Хранить результаты по hash конфигурации
- Возвращать кэшированные результаты

**Этап 3: Добавить waiting users list**
- Заменить простой lock на структуру с waiters
- Реализовать подписку на результаты

**Этап 4: Добавить умную логику отмены**
- Отменять компиляции при изменениях
- Учитывать списки ожидающих

## 🔄 Упрощённое решение для текущей проблемы

Если полная реализация сейчас не нужна, можно сделать **quick fix**:

### Изменить LockManager.js:

```javascript
// Вместо throw error при locked
if (currentLock != null) {
  if (currentLock.isExpired()) {
    logger.warn({ key }, 'Compile lock expired')
    currentLock.release()
  } else {
    // Вместо ошибки - подождать и попробовать снова
    await this.waitForLock(key, LOCK_TIMEOUT_MS)
  }
}

async waitForLock(key, timeout) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    const lock = LOCKS.get(key)
    if (!lock || lock.isExpired()) {
      return // Лок освободился
    }
    await new Promise(resolve => setTimeout(resolve, 1000)) // Ждём 1 секунду
  }
  
  throw new Errors.CompilationTimeoutError('compilation timeout')
}
```

### Добавить WebSocket уведомления:

```javascript
// При завершении компиляции
lock.on('released', () => {
  io.to(`project-${projectId}`).emit('compilation-completed', result)
})
```

## 📊 Сравнение подходов

| Аспект | Текущее | Quick Fix | Полная архитектура |
|--------|---------|-----------|-------------------|
| Сложность реализации | - | 🟢 Низкая | 🔴 Высокая |
| Время разработки | - | 1-2 дня | 2-3 недели |
| Решает проблему reload | ❌ | ✅ | ✅ |
| Config-based caching | ❌ | ❌ | ✅ |
| Multi-user optimization | ❌ | ⚠️ Частично | ✅ |
| Version tracking | ❌ | ❌ | ✅ |
| Production ready | ❌ | ⚠️ | ✅ |

## ✅ Рекомендации

### Для dev окружения:
1. Реализовать **quick fix** с ожиданием lock
2. Добавить WebSocket уведомления

### Для production:
1. Реализовать **полную архитектуру**
2. Использовать Redis для состояния
3. Добавить мониторинг и метрики

## 📝 TODO для полной реализации

- [ ] Создать структуры данных (ProjectCompilationState и т.д.)
- [ ] Реализовать CompilationQueueManager
- [ ] Добавить Redis store для состояния
- [ ] Реализовать version tracking (project hash)
- [ ] Добавить config-based caching
- [ ] Реализовать waiting users list
- [ ] Добавить WebSocket уведомления
- [ ] Реализовать умную логику отмены
- [ ] Добавить cleanup при disconnection
- [ ] Написать тесты
- [ ] Добавить мониторинг и метрики
- [ ] Документировать API

---

**Итог:** Ваша предложенная архитектура - **правильная** для production системы. Для dev окружения можно начать с quick fix, а затем постепенно мигрировать к полной реализации.

