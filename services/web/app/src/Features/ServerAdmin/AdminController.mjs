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
      const defaultLanguage =
        await SystemSettingsManager.promises.getSetting('defaultLanguage')
      const peerReviewMode =
        await SystemSettingsManager.promises.getSetting('peerReviewMode')
      const disableChat =
        await SystemSettingsManager.promises.getSetting('disableChat')
      const disableLinkSharing =
        await SystemSettingsManager.promises.getSetting('disableLinkSharing')
      const adminEmail =
        await SystemSettingsManager.promises.getSetting('adminEmail')
      const maxDocLength =
        await SystemSettingsManager.promises.getSetting('maxDocLength')
      const maxUploadSize =
        await SystemSettingsManager.promises.getSetting('maxUploadSize')

      res.render('admin/index', {
        title: 'System Admin',
        openSockets,
        systemMessages,
        registrationEnabled: registrationEnabled || false,
        defaultLanguage: defaultLanguage || 'en',
        peerReviewMode: Boolean(peerReviewMode),
        disableChat: Boolean(disableChat),
        disableLinkSharing: Boolean(disableLinkSharing),
        adminEmail: adminEmail || 'placeholder@example.com',
        maxDocLength: Number(maxDocLength) || 2,
        maxUploadSize: Number(maxUploadSize) || 50,
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

  async setDefaultLanguage(req, res, next) {
    try {
      const language = req.body.language
      logger.info({ language }, 'setting default site language')
      await SystemSettingsManager.promises.setSetting('defaultLanguage', language)
      res.redirect('/admin#site-settings')
    } catch (error) {
      logger.error({ error }, 'error setting default language')
      return next(error)
    }
  },

  async togglePeerReviewMode(req, res, next) {
    try {
      const enabled = req.body.enabled === 'true' || req.body.enabled === true
      await SystemSettingsManager.promises.setSetting('peerReviewMode', enabled)
      res.redirect('/admin#site-settings')
    } catch (error) {
      return next(error)
    }
  },

  async updateSiteSettings(req, res, next) {
    try {
      if (req.body.defaultLanguage) {
        await SystemSettingsManager.promises.setSetting(
          'defaultLanguage',
          req.body.defaultLanguage
        )
      }
      const peerReviewMode = req.body.peerReviewMode === 'on'
      await SystemSettingsManager.promises.setSetting(
        'peerReviewMode',
        peerReviewMode
      )
      // If peer-review mode is enabled, disable registration
      const registrationEnabled = peerReviewMode
        ? false
        : req.body.registrationEnabled === 'on'
      await SystemSettingsManager.promises.setSetting(
        'registrationEnabled',
        registrationEnabled
      )
      
      const disableChat = req.body.disableChat === 'on'
      await SystemSettingsManager.promises.setSetting('disableChat', disableChat)
      // Apply to runtime Settings
      Settings.disableChat = disableChat
      
      const disableLinkSharing = req.body.disableLinkSharing === 'on'
      await SystemSettingsManager.promises.setSetting(
        'disableLinkSharing',
        disableLinkSharing
      )
      // Apply to runtime Settings
      Settings.disableLinkSharing = disableLinkSharing
      
      if (req.body.adminEmail) {
        await SystemSettingsManager.promises.setSetting(
          'adminEmail',
          req.body.adminEmail
        )
        // Apply to runtime Settings
        Settings.adminEmail = req.body.adminEmail
      }
      
      if (req.body.maxDocLength) {
        const maxDocLength = parseInt(req.body.maxDocLength, 10)
        if (maxDocLength > 0) {
          await SystemSettingsManager.promises.setSetting(
            'maxDocLength',
            maxDocLength
          )
          // Apply to runtime Settings (convert MB to bytes)
          Settings.max_doc_length = maxDocLength * 1024 * 1024
        }
      }
      
      if (req.body.maxUploadSize) {
        const maxUploadSize = parseInt(req.body.maxUploadSize, 10)
        if (maxUploadSize > 0) {
          await SystemSettingsManager.promises.setSetting(
            'maxUploadSize',
            maxUploadSize
          )
          // Apply to runtime Settings (convert MB to bytes)
          Settings.maxUploadSize = maxUploadSize * 1024 * 1024
        }
      }
      
      logger.info(
        {
          disableChat: Settings.disableChat,
          disableLinkSharing: Settings.disableLinkSharing,
          adminEmail: Settings.adminEmail,
          maxDocLength: Settings.max_doc_length,
          maxUploadSize: Settings.maxUploadSize,
        },
        'updated runtime settings'
      )
      
      res.redirect('/admin#site-settings')
    } catch (error) {
      logger.error({ error }, 'error updating site settings')
      return next(error)
    }
  },
}

export default AdminController
