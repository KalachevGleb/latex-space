const logger = require('@overleaf/logger')
const request = require('request')
const Settings = require('@overleaf/settings')

/**
 * CompilationNotifier
 * 
 * Sends compilation notifications to real-time service via HTTP
 * Real-time service will forward these to connected clients via WebSocket
 */
class CompilationNotifier {
  constructor(queueManager) {
    this.queueManager = queueManager
    this.realTimeUrl = Settings.apis?.realTime?.url || 'http://real-time:3026'

    // Subscribe to queue manager events
    this.queueManager.on('compilation-complete', (event) => {
      this._notifyCompilationComplete(event)
    })

    this.queueManager.on('compilation-error', (event) => {
      this._notifyCompilationError(event)
    })

    this.queueManager.on('compilation-cancelled', (event) => {
      this._notifyCompilationCancelled(event)
    })

    logger.debug('CompilationNotifier initialized')
  }

  async _notifyCompilationComplete(event) {
    const { projectId, userId, configHash, result } = event

    logger.debug(
      { projectId, userId, configHash },
      'notifying compilation complete'
    )

    try {
      await this._sendToRealTime(projectId, userId, {
        type: 'compilation-complete',
        configHash,
        status: result.status,
        outputFiles: result.outputFiles,
        buildId: result.buildId,
        stats: result.stats,
      })
    } catch (error) {
      logger.error(
        { err: error, projectId, userId },
        'failed to notify compilation complete'
      )
    }
  }

  async _notifyCompilationError(event) {
    const { projectId, userId, configHash, error } = event

    logger.debug(
      { projectId, userId, configHash },
      'notifying compilation error'
    )

    try {
      await this._sendToRealTime(projectId, userId, {
        type: 'compilation-error',
        configHash,
        error,
      })
    } catch (err) {
      logger.error(
        { err, projectId, userId },
        'failed to notify compilation error'
      )
    }
  }

  async _notifyCompilationCancelled(event) {
    const { projectId, userId, configHash, reason } = event

    logger.debug(
      { projectId, userId, configHash, reason },
      'notifying compilation cancelled'
    )

    try {
      await this._sendToRealTime(projectId, userId, {
        type: 'compilation-cancelled',
        configHash,
        reason,
      })
    } catch (error) {
      logger.error(
        { err: error, projectId, userId },
        'failed to notify compilation cancelled'
      )
    }
  }

  async _sendToRealTime(projectId, userId, payload) {
    return new Promise((resolve, reject) => {
      request.post(
        {
          url: `${this.realTimeUrl}/project/${projectId}/compilation-update`,
          json: {
            userId,
            ...payload,
          },
          timeout: 5000,
        },
        (error, response, body) => {
          if (error) {
            return reject(error)
          }
          if (response.statusCode !== 200) {
            return reject(
              new Error(
                `real-time returned ${response.statusCode}: ${body}`
              )
            )
          }
          resolve(body)
        }
      )
    })
  }
}

module.exports = CompilationNotifier

