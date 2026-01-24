import AuthenticationController from './AuthenticationController.js'
import UserGetter from '../User/UserGetter.js'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'

const SERVICE_USER_ID_HEADER = 'x-overleaf-user-id'
const SERVICE_USER_EMAIL_HEADER = 'x-overleaf-user-email'

function requireServiceAuth(req, res, next) {
  // Check if Service API is enabled
  if (!Settings.serviceApi?.enabled) {
    logger.warn('Service API access attempted but not enabled')
    return res.status(403).json({
      error: 'service_api_disabled',
      error_description: 'Service API is not enabled',
    })
  }

  // Check localhost-only restriction
  if (Settings.serviceApi?.localhostOnly) {
    const ip = req.ip || req.connection.remoteAddress
    const isLocalhost =
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip === 'localhost'

    if (!isLocalhost) {
      logger.warn({ ip }, 'Service API access denied: not from localhost')
      return res.status(403).json({
        error: 'access_denied',
        error_description: 'Service API access restricted to localhost',
      })
    }
  }

  const basicAuth = AuthenticationController.requirePrivateApiAuth()
  return basicAuth(req, res, err => {
    if (err) {
      return next(err)
    }
    req.isServiceAuth = true
    const userId = req.get(SERVICE_USER_ID_HEADER)
    const userEmail = req.get(SERVICE_USER_EMAIL_HEADER)
    if (userId || userEmail) {
      req.serviceUser = { userId, userEmail }
    }
    return next()
  })
}

async function attachSessionUser(req, res, next) {
  if (!req.isServiceAuth) {
    return next()
  }
  if (!req.session || !req.serviceUser) {
    return next()
  }
  const { userId, userEmail } = req.serviceUser
  if (!userId && !userEmail) {
    return next()
  }
  try {
    const user = userId
      ? await UserGetter.promises.getUser(userId)
      : await UserGetter.promises.getUserByAnyEmail(userEmail)
    if (!user) {
      return res.status(401).json({
        error: 'invalid_user',
        error_description: 'Service user not found',
      })
    }
    req.user = user
    req.session.user = user
    req.logger?.addFields({ userId: user._id })
    return next()
  } catch (err) {
    return next(err)
  }
}

export default {
  requireServiceAuth,
  attachSessionUser,
}

