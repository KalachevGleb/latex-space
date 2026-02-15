import UserGetter from '../User/UserGetter.js'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import basicAuth from 'basic-auth'
import bcrypt from 'bcrypt'
import SystemSettingsManager from '../SystemSettings/SystemSettingsManager.mjs'
import AsyncLocalStorage from '../../infrastructure/AsyncLocalStorage.js'

const SERVICE_USER_ID_HEADER = 'x-overleaf-user-id'
const SERVICE_USER_EMAIL_HEADER = 'x-overleaf-user-email'

// Detect whether a string is a bcrypt hash (starts with $2a$, $2b$, or $2y$, 60 chars)
function isBcryptHash(value) {
  return (
    typeof value === 'string' &&
    value.length === 60 &&
    /^\$2[aby]\$\d{2}\$/.test(value)
  )
}

// One-time migration: if the password in MongoDB is still plain text, hash it now.
async function migratePasswordIfNeeded(storedPassword) {
  if (isBcryptHash(storedPassword)) {
    return storedPassword
  }
  logger.info('Service API: migrating plain-text password to bcrypt hash')
  const BCRYPT_ROUNDS = Settings.security?.bcryptRounds || 12
  const hashed = await bcrypt.hash(storedPassword, BCRYPT_ROUNDS)
  await SystemSettingsManager.promises.setSetting(
    'serviceApiPassword',
    hashed
  )
  Settings.serviceApi.password = hashed
  return hashed
}

async function requireServiceAuth(req, res, next) {
  if (!Settings.serviceApi?.enabled) {
    logger.warn('Service API access attempted but not enabled')
    return res.status(403).json({
      error: 'service_api_disabled',
      error_description: 'Service API is not enabled',
    })
  }

  if (!Settings.serviceApi?.password) {
    logger.warn('Service API access attempted but no password configured')
    return res.status(403).json({
      error: 'service_api_not_configured',
      error_description: 'Service API password is not configured',
    })
  }

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

  const credentials = basicAuth(req)
  if (!credentials || credentials.name !== 'overleaf') {
    res.setHeader('WWW-Authenticate', 'Basic realm="Service API"')
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid credentials',
    })
  }

  try {
    const hashedPassword = await migratePasswordIfNeeded(
      Settings.serviceApi.password
    )
    const match = await bcrypt.compare(credentials.pass, hashedPassword)

    if (!match) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Service API"')
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Invalid credentials',
      })
    }
  } catch (err) {
    return next(err)
  }

  req.isServiceAuth = true

  // Store Service API context in AsyncLocalStorage for bypassing file protection
  const store = AsyncLocalStorage.storage.getStore()
  if (store) {
    store.isServiceAuth = true
  }

  const userId = req.get(SERVICE_USER_ID_HEADER)
  const userEmail = req.get(SERVICE_USER_EMAIL_HEADER)
  if (userId || userEmail) {
    req.serviceUser = { userId, userEmail }
  }
  return next()
}

async function attachSessionUser(req, res, next) {
  if (!req.isServiceAuth) {
    return next()
  }
  if (!req.serviceUser) {
    return next()
  }
  const { userId, userEmail } = req.serviceUser
  if (!userId && !userEmail) {
    return next()
  }

  logger.info(
    { userId, userEmail, lookupBy: userId ? 'id' : 'email' },
    'Service API: looking up user'
  )

  try {
    const user = userId
      ? await UserGetter.promises.getUser(userId)
      : await UserGetter.promises.getUserByAnyEmail(userEmail)

    logger.info(
      { userId, userEmail, userFound: !!user, foundUserId: user?._id },
      'Service API: user lookup result'
    )

    if (!user) {
      logger.warn(
        { userId, userEmail },
        'Service API: user not found in database'
      )
      return res.status(401).json({
        error: 'invalid_user',
        error_description: 'Service user not found',
      })
    }
    req.user = user
    if (req.session) {
      req.session.user = user
    }
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

