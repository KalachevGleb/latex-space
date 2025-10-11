const crypto = require('node:crypto')
const logger = require('@overleaf/logger')
const Metrics = require('@overleaf/metrics')
const EventEmitter = require('node:events')

/**
 * CompilationQueueManager
 * 
 * Manages compilation queue with smart caching and multi-user support.
 * 
 * Features:
 * - Version tracking: tracks project content changes
 * - Config-based caching: caches results by compilation configuration
 * - Waiting users: multiple users can wait for the same compilation
 * - Smart cancellation: cancels compilations when project changes or no users waiting
 */
class CompilationQueueManager extends EventEmitter {
  constructor() {
    super()
    // Map: projectId -> ProjectCompilationState
    // NOTE: Per-project, NOT per-user - compilation result is the same for all users
    this.states = new Map()
    
    // Map: userId -> Set<projectId> (for cleanup on disconnect)
    this.userProjects = new Map()
    
    // Map: projectId -> { version: number, filesMd5: string }
    this.projectVersions = new Map()
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredStates()
    }, 60000) // Every minute
  }

  /**
   * Request a compilation
   * 
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID
   * @param {object} config - Compilation config
   * @param {string} connectionId - WebSocket connection ID (optional)
   * @returns {Promise<object>} Compilation result or status
   */
  async requestCompilation(projectId, userId, config, connectionId = null) {
    logger.debug(
      { projectId, userId, config, connectionId },
      'requesting compilation'
    )

    const state = this._getOrCreateState(projectId)
    const configHash = this._hashConfig(config)

    // Track user-project relationship
    this._trackUserProject(userId, projectId)

    // Check if project version changed (via explicit notification)
    // Version is incremented when files are added/edited/deleted
    const currentVersion = this._getCurrentVersion(projectId)
    if (state.projectVersion !== currentVersion) {
      logger.debug(
        { projectId, oldVersion: state.projectVersion, newVersion: currentVersion },
        'project version changed, invalidating cache'
      )
      await this._handleProjectVersionChange(state, currentVersion, userId)
    }

    // Check for cached result
    const cached = state.compilations.get(configHash)
    if (cached && cached.status === 'success') {
      logger.debug(
        { projectId, configHash },
        'returning cached compilation result'
      )
      Metrics.inc('compilation-cache-hit')
      return {
        status: 'success',
        fromCache: true,
        ...cached,
      }
    }

    // Check if compilation is already running with same config
    if (
      state.runningCompilation &&
      state.runningCompilation.configHash === configHash
    ) {
      logger.debug(
        { projectId, configHash, userId },
        'joining existing compilation'
      )
      
      // Add user to waiting list
      state.runningCompilation.waitingUsers.add(userId)
      if (connectionId) {
        state.runningCompilation.connections.set(userId, connectionId)
      }

      Metrics.inc('compilation-joined')
      return {
        status: 'compile-in-progress',
        shouldCompile: false, // This user should NOT compile, just wait
        startedAt: state.runningCompilation.startedAt,
        configHash,
      }
    }

    // Check if different compilation is running
    if (state.runningCompilation) {
      const running = state.runningCompilation

      // Same user requesting different config?
      if (running.waitingUsers.has(userId)) {
        logger.debug(
          { projectId, userId, oldConfig: running.configHash, newConfig: configHash },
          'user requesting different config, removing from current compilation'
        )
        
        // Remove from current compilation
        running.waitingUsers.delete(userId)
        running.connections.delete(userId)

        // If no one waiting, we'll cancel it below
        if (running.waitingUsers.size === 0) {
          await this._cancelCompilation(state, 'no-waiting-users')
        }
      } else {
        // Different user, different config
        logger.debug(
          { projectId, userId, configHash },
          'different compilation running, queueing request'
        )
        
        Metrics.inc('compilation-queued')
        return {
          status: 'compile-in-progress',
          shouldCompile: false, // Wait for other compilation to finish
          message: 'Another compilation is in progress',
          configHash,
        }
      }
    }

    // Start new compilation
    logger.info({ projectId, userId, configHash }, 'starting new compilation')
    return await this._startCompilation(state, config, configHash, userId, connectionId)
  }

  /**
   * Check if project files changed and update version
   * 
   * @param {string} projectId - Project ID
   * @param {string} filesMd5 - MD5 hash of all project files
   * @returns {boolean} True if version was incremented
   */
  checkAndUpdateVersion(projectId, filesMd5) {
    const versionInfo = this.projectVersions.get(projectId) || { version: 0, filesMd5: null }
    
    // Compare md5
    if (versionInfo.filesMd5 !== filesMd5) {
      const newVersion = versionInfo.version + 1
      this.projectVersions.set(projectId, { version: newVersion, filesMd5 })
      
      logger.info(
        { projectId, oldVersion: versionInfo.version, newVersion, filesMd5 },
        'project files changed, version incremented'
      )
      
      // Clear cache for this project
      const state = this.states.get(projectId)
      if (state) {
        state.compilations.clear()
        state.projectVersion = newVersion
      }
      
      return true
    }
    
    return false
  }

  /**
   * Notify that compilation has completed
   * 
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID (ignored, kept for compatibility)
   * @param {object} result - Compilation result
   */
  async notifyCompilationComplete(projectId, userId, result) {
    const state = this.states.get(projectId)
    if (!state || !state.runningCompilation) {
      logger.warn({ projectId }, 'received completion for non-running compilation')
      return
    }

    const { configHash, waitingUsers, connections } = state.runningCompilation

    logger.info(
      { projectId, configHash, waitingUsers: waitingUsers.size },
      'compilation completed'
    )

    // Store result in cache
    const cacheEntry = {
      status: result.status === 'success' ? 'success' : 'failure',
      ...result,
      cachedAt: new Date(),
    }
    state.compilations.set(configHash, cacheEntry)

    // Notify all waiting users via event emitter
    for (const userId of waitingUsers) {
      const connectionId = connections.get(userId)
      this.emit('compilation-complete', {
        projectId,
        userId,
        connectionId,
        configHash,
        result: cacheEntry,
      })
    }
    
    // Also emit without userId for waiters
    this.emit('compilation-complete', {
      projectId,
      configHash,
      result: cacheEntry,
    })

    // Clear running compilation
    state.runningCompilation = null

    // Update metrics
    Metrics.inc('compilation-completed')
    Metrics.gauge('active-compilations', this._countActiveCompilations())
  }

  /**
   * Notify that compilation has failed
   * 
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID (ignored, kept for compatibility)
   * @param {Error} error - Error object
   */
  async notifyCompilationError(projectId, userId, error) {
    const state = this.states.get(projectId)
    if (!state || !state.runningCompilation) {
      return
    }

    const { configHash, waitingUsers, connections } = state.runningCompilation

    logger.error(
      { projectId, configHash, err: error },
      'compilation failed'
    )

    // Store error in cache (with shorter TTL)
    const cacheEntry = {
      status: 'failure',
      error: error.message,
      cachedAt: new Date(),
    }
    state.compilations.set(configHash, cacheEntry)

    // Notify all waiting users
    for (const userId of waitingUsers) {
      const connectionId = connections.get(userId)
      this.emit('compilation-error', {
        projectId,
        userId,
        connectionId,
        configHash,
        error: error.message,
      })
    }
    
    // Also emit without userId for waiters
    this.emit('compilation-error', {
      projectId,
      configHash,
      error: error.message,
    })

    // Clear running compilation
    state.runningCompilation = null

    Metrics.inc('compilation-failed')
  }

  /**
   * Handle user disconnection
   * 
   * @param {string} userId - User ID
   */
  async handleUserDisconnected(userId) {
    logger.debug({ userId }, 'user disconnected, cleaning up')

    const projectIds = this.userProjects.get(userId)
    if (!projectIds) return

    for (const projectId of projectIds) {
      const state = this.states.get(projectId)
      if (!state || !state.runningCompilation) continue

      const { waitingUsers } = state.runningCompilation

      if (waitingUsers.has(userId)) {
        waitingUsers.delete(userId)
        state.runningCompilation.connections.delete(userId)

        logger.debug(
          { projectId, userId, remainingUsers: waitingUsers.size },
          'removed user from compilation'
        )

        // Cancel if no one waiting
        if (waitingUsers.size === 0) {
          await this._cancelCompilation(state, 'no-waiting-users')
        }
      }
    }

    this.userProjects.delete(userId)
  }

  /**
   * Clear cache for a project
   * 
   * @param {string} projectId - Project ID
   */
  clearProjectCache(projectId) {
    const state = this.states.get(projectId)
    if (state) {
      state.compilations.clear()
      logger.info({ projectId }, 'cleared compilation cache')
    }
  }


  // ========== Private Methods ==========

  _getOrCreateState(projectId) {
    if (!this.states.has(projectId)) {
      const currentVersion = this._getCurrentVersion(projectId)
      this.states.set(projectId, {
        projectId,
        projectVersion: currentVersion,
        compilations: new Map(), // configHash -> result
        runningCompilation: null,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      })
    }

    const state = this.states.get(projectId)
    state.lastAccessedAt = new Date()
    return state
  }

  _trackUserProject(userId, projectId) {
    if (!this.userProjects.has(userId)) {
      this.userProjects.set(userId, new Set())
    }
    this.userProjects.get(userId).add(projectId)
  }

  _hashConfig(config) {
    // Create canonical representation of config
    // NOTE: Do NOT include buildId - version tracking is separate!
    const canonical = {
      compiler: config.compiler,
      rootDocId: config.rootDoc_id,
      draft: config.draft || false,
      stopOnFirstError: config.stopOnFirstError || false,
      imageName: config.imageName || 'default',
      flags: config.flags || [],
    }

    const str = JSON.stringify(canonical, Object.keys(canonical).sort())
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16)
  }

  _getCurrentVersion(projectId) {
    // Get current version number for project (incremental: 1, 2, 3, ...)
    const versionInfo = this.projectVersions.get(projectId)
    return versionInfo ? versionInfo.version : 0
  }

  async _handleProjectVersionChange(state, newVersion, triggeringUserId) {
    logger.debug(
      {
        projectId: state.projectId,
        oldVersion: state.projectVersion,
        newVersion,
      },
      'handling project version change'
    )

    // Update version
    state.projectVersion = newVersion

    // Clear cache
    state.compilations.clear()

    // Handle running compilation
    if (state.runningCompilation) {
      const { waitingUsers } = state.runningCompilation

      // Remove triggering user from waiting list
      waitingUsers.delete(triggeringUserId)

      // Cancel if no one else waiting
      if (waitingUsers.size === 0) {
        await this._cancelCompilation(state, 'project-changed')
      }
    }

    Metrics.inc('project-version-changed')
  }

  async _startCompilation(state, config, configHash, userId, connectionId) {
    // Create running compilation record
    state.runningCompilation = {
      configHash,
      config,
      waitingUsers: new Set([userId]),
      connections: new Map(connectionId ? [[userId, connectionId]] : []),
      startedBy: userId,
      startedAt: new Date(),
    }

    Metrics.inc('compilation-started')
    Metrics.gauge('active-compilations', this._countActiveCompilations())

    logger.info(
      { projectId: state.projectId, configHash, userId },
      'compilation started'
    )

    return {
      status: 'compile-in-progress',
      shouldCompile: true, // This user should proceed with actual compilation
      startedAt: state.runningCompilation.startedAt,
      configHash,
    }
  }

  async _cancelCompilation(state, reason) {
    if (!state.runningCompilation) return

    logger.info(
      { projectId: state.projectId, reason },
      'cancelling compilation'
    )

    const { configHash, waitingUsers, connections } = state.runningCompilation

    // Notify users about cancellation
    for (const userId of waitingUsers) {
      const connectionId = connections.get(userId)
      this.emit('compilation-cancelled', {
        projectId: state.projectId,
        userId,
        connectionId,
        configHash,
        reason,
      })
    }

    // Emit event for CompileManager to kill the process
    this.emit('cancel-compilation', {
      projectId: state.projectId,
      configHash,
      reason,
    })

    state.runningCompilation = null

    Metrics.inc('compilation-cancelled')
    Metrics.gauge('active-compilations', this._countActiveCompilations())
  }

  _countActiveCompilations() {
    let count = 0
    for (const state of this.states.values()) {
      if (state.runningCompilation) {
        count++
      }
    }
    return count
  }

  _cleanupExpiredStates() {
    const now = Date.now()
    const expiryTime = 60 * 60 * 1000 // 1 hour

    for (const [projectId, state] of this.states.entries()) {
      // Don't cleanup if compilation is running
      if (state.runningCompilation) continue

      // Cleanup if not accessed for 1 hour
      if (now - state.lastAccessedAt.getTime() > expiryTime) {
        logger.debug({ projectId }, 'cleaning up expired compilation state')
        this.states.delete(projectId)
      }
    }

    Metrics.gauge('compilation-states-count', this.states.size)
  }

  shutdown() {
    clearInterval(this.cleanupInterval)
    this.removeAllListeners()
    this.states.clear()
    this.userProjects.clear()
    this.projectVersions.clear()
  }
}

// Singleton instance
const queueManager = new CompilationQueueManager()

module.exports = queueManager

