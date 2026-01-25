import UserGetter from './UserGetter.js'
import OError from '@overleaf/o-error'
import UserSessionsManager from './UserSessionsManager.js'
import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import AuthenticationController from '../Authentication/AuthenticationController.js'
import SessionManager from '../Authentication/SessionManager.js'
import NewsletterManager from '../Newsletter/NewsletterManager.js'
import _ from 'lodash'
import { expressify } from '@overleaf/promise-utils'
import Features from '../../infrastructure/Features.js'
import Modules from '../../infrastructure/Modules.js'
import SystemSettingsManager from '../SystemSettings/SystemSettingsManager.mjs'

async function settingsPage(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const reconfirmationRemoveEmail = req.query.remove
  const projectSyncSuccessMessage = req.session.projectSyncSuccessMessage
  if (projectSyncSuccessMessage) {
    delete req.session.projectSyncSuccessMessage
  }
  let shouldAllowEditingDetails = true
  if (Settings.ldap && Settings.ldap.updateUserDetailsOnLogin) {
    shouldAllowEditingDetails = false
  }

  const user = await UserGetter.promises.getUser(userId)
  if (!user) {
    // The user has just deleted their account.
    return UserSessionsManager.removeSessionsFromRedis(
      { _id: userId },
      null,
      () => res.redirect('/')
    )
  }

  let personalAccessTokens
  try {
    const results = await Modules.promises.hooks.fire(
      'listPersonalAccessTokens',
      user._id
    )
    personalAccessTokens = results?.[0] ?? []
  } catch (error) {
    const err = OError.tag(error, 'listPersonalAccessTokens hook failed')
    logger.error({ err, userId }, err.message)
  }

  const currentManagedUserAdminEmail = null

  res.render('user/settings', {
    title: 'account_settings',
    user: {
      id: user._id,
      isAdmin: user.isAdmin,
      email: user.email,
      allowedFreeTrial: user.allowedFreeTrial,
      first_name: user.first_name,
      last_name: user.last_name,
      alphaProgram: user.alphaProgram,
      betaProgram: user.betaProgram,
      labsProgram: user.labsProgram,
      features: {
        dropbox: user.features.dropbox,
        github: user.features.github,
        mendeley: user.features.mendeley,
        zotero: user.features.zotero,
        papers: user.features.papers,
        references: user.features.references,
      },
      refProviders: {
        mendeley: Boolean(user.refProviders?.mendeley),
        zotero: Boolean(user.refProviders?.zotero),
        papers: Boolean(user.refProviders?.papers),
      },
      writefull: {
        enabled: Boolean(user.writefull?.enabled),
      },
      aiErrorAssistant: {
        enabled: Boolean(user.aiErrorAssistant?.enabled),
      },
    },
    userSettings: {
      interfaceLanguage: user.ace?.interfaceLanguage || 'default',
    },
    labsExperiments: user.labsExperiments ?? [],
    hasPassword: !!user.hashedPassword,
    shouldAllowEditingDetails,
    reconfirmationRemoveEmail,
    projectSyncSuccessMessage,
    personalAccessTokens,
    emailAddressLimit: Settings.emailAddressLimit,
    isManagedAccount: !!req.managedBy,
    userRestrictions: Array.from(req.userRestrictions || []),
    currentManagedUserAdminEmail,
    gitBridgeEnabled: Settings.enableGitBridge,
    isSaas: Features.hasFeature('saas'),
    capabilities: [...req.capabilitySet],
  })
}

async function accountSuspended(req, res) {
  if (SessionManager.isUserLoggedIn(req.session)) {
    return res.redirect('/project')
  }
  res.render('user/accountSuspended', {
    title: 'your_account_is_suspended',
  })
}

async function reconfirmAccountPage(req, res) {
  const pageData = {
    reconfirm_email: req.session.reconfirm_email,
  }

  res.render('user/reconfirm', pageData)
}

const UserPagesController = {
  accountSuspended: expressify(accountSuspended),

  async registerPage(req, res) {
    const sharedProjectData = req.session.sharedProjectData || {}

    const newTemplateData = {}
    if (req.session.templateData != null) {
      newTemplateData.templateName = req.session.templateData.templateName
    }

    // Получаем настройку регистрации
    const registrationEnabled =
      (await SystemSettingsManager.promises.getSetting('registrationEnabled')) ||
      false

    res.render('user/register', {
      title: 'register',
      sharedProjectData,
      newTemplateData,
      registrationEnabled,
    })
  },

  loginPage(req, res) {
    // if user is being sent to /login with explicit redirect (redir=/foo),
    // such as being sent from the editor to /login, then set the redirect explicitly
    if (
      req.query.redir != null &&
      AuthenticationController.getRedirectFromSession(req) == null
    ) {
      AuthenticationController.setRedirectInSession(req, req.query.redir)
    }
    const metadata = { robotsNoindexNofollow: false }
    if (Object.keys(req.query).length !== 0) {
      metadata.robotsNoindexNofollow = true
    }
    res.render('user/login', {
      title: Settings.nav?.login_support_title || 'login',
      login_support_title: Settings.nav?.login_support_title,
      login_support_text: Settings.nav?.login_support_text,
      metadata,
    })
  },

  /**
   * Landing page for users who may have received one-time login
   * tokens from the read-only maintenance site.
   *
   * We tell them that Overleaf is back up and that they can login normally.
   */
  oneTimeLoginPage(req, res, next) {
    res.render('user/one_time_login')
  },

  renderReconfirmAccountPage: expressify(reconfirmAccountPage),

  settingsPage: expressify(settingsPage),

  sessionsPage(req, res, next) {
    const user = SessionManager.getSessionUser(req.session)
    logger.debug({ userId: user._id }, 'loading sessions page')
    const currentSession = {
      ip_address: user.ip_address,
      session_created: user.session_created,
    }
    UserSessionsManager.getAllUserSessions(
      user,
      [req.sessionID],
      (err, sessions) => {
        if (err != null) {
          OError.tag(err, 'error getting all user sessions', {
            userId: user._id,
          })
          return next(err)
        }
        res.render('user/sessions', {
          title: 'sessions',
          currentSession,
          sessions,
        })
      }
    )
  },

  emailPreferencesPage(req, res, next) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    UserGetter.getUser(
      userId,
      { _id: 1, email: 1, first_name: 1, last_name: 1 },
      (err, user) => {
        if (err != null) {
          return next(err)
        }
        NewsletterManager.subscribed(user, (err, subscribed) => {
          if (err != null) {
            OError.tag(err, 'error getting newsletter status')
            return next(err)
          }
          res.render('user/email-preferences', {
            title: 'newsletter_info_title',
            subscribed,
          })
        })
      }
    )
  },

  async compromisedPasswordPage(req, res) {
    res.render('user/compromised_password')
  },

}

export default UserPagesController
