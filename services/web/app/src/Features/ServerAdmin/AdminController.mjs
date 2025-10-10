import logger from '@overleaf/logger'
import http from 'node:http'
import https from 'node:https'
import Settings from '@overleaf/settings'
import TpdsUpdateSender from '../ThirdPartyDataStore/TpdsUpdateSender.js'
import TpdsProjectFlusher from '../ThirdPartyDataStore/TpdsProjectFlusher.js'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import SystemMessageManager from '../SystemMessages/SystemMessageManager.mjs'
import SystemSettingsManager from '../SystemSettings/SystemSettingsManager.mjs'

const AdminController = {
  _sendDisconnectAllUsersMessage: delay => {
    return EditorRealTimeController.emitToAll(
      'forceDisconnect',
      'Sorry, we are performing a quick update to the editor and need to close it down. Please refresh the page to continue.',
      delay
    )
  },
  index: async (req, res, next) => {
    let url
    const openSockets = {}
    for (url in http.globalAgent.sockets) {
      openSockets[`http://${url}`] = http.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    for (url in https.globalAgent.sockets) {
      openSockets[`https://${url}`] = https.globalAgent.sockets[url].map(
        socket => socket._httpMessage.path
      )
    }

    try {
      const systemMessages =
        await SystemMessageManager.promises.getMessagesFromDB()
      const registrationEnabled =
        await SystemSettingsManager.promises.getSetting('registrationEnabled')

      res.render('admin/index', {
        title: 'System Admin',
        openSockets,
        systemMessages,
        registrationEnabled: registrationEnabled || false,
      })
    } catch (error) {
      return next(error)
    }
  },

  disconnectAllUsers: (req, res) => {
    logger.warn('disconecting everyone')
    const delay = (req.query && req.query.delay) > 0 ? req.query.delay : 10
    AdminController._sendDisconnectAllUsersMessage(delay)
    res.redirect('/admin#open-close-editor')
  },

  openEditor(req, res) {
    logger.warn('opening editor')
    Settings.editorIsOpen = true
    res.redirect('/admin#open-close-editor')
  },

  closeEditor(req, res) {
    logger.warn('closing editor')
    Settings.editorIsOpen = req.body.isOpen
    res.redirect('/admin#open-close-editor')
  },

  flushProjectToTpds(req, res, next) {
    TpdsProjectFlusher.flushProjectToTpds(req.body.project_id, error => {
      if (error) {
        return next(error)
      }
      res.sendStatus(200)
    })
  },

  pollDropboxForUser(req, res) {
    const { user_id: userId } = req.body
    TpdsUpdateSender.pollDropboxForUser(userId, () => res.sendStatus(200))
  },

  createMessage(req, res, next) {
    SystemMessageManager.createMessage(req.body.content, function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  clearMessages(req, res, next) {
    SystemMessageManager.clearMessages(function (error) {
      if (error) {
        return next(error)
      }
      res.redirect('/admin#system-messages')
    })
  },

  async toggleRegistration(req, res, next) {
    try {
      const enabled = req.body.enabled === 'true' || req.body.enabled === true
      logger.info({ enabled }, 'toggling user registration')
      await SystemSettingsManager.promises.setSetting(
        'registrationEnabled',
        enabled
      )
      res.redirect('/admin#registration-settings')
    } catch (error) {
      logger.error({ error }, 'error toggling registration')
      return next(error)
    }
  },
}

export default AdminController
