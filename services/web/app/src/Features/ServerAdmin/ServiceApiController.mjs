import Settings from '@overleaf/settings'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import logger from '@overleaf/logger'
import SystemSettingsManager from '../SystemSettings/SystemSettingsManager.mjs'

const BCRYPT_ROUNDS = Settings.security?.bcryptRounds || 12

// Load config from MongoDB (admin panel settings only)
async function getDefaultConfig() {
  return {
    enabled:
      (await SystemSettingsManager.promises.getSetting('serviceApiEnabled')) ||
      false,
    password:
      (await SystemSettingsManager.promises.getSetting('serviceApiPassword')) ||
      null,
    localhostOnly:
      (await SystemSettingsManager.promises.getSetting(
        'serviceApiLocalhostOnly'
      )) ||
      false,
  }
}

async function loadConfig() {
  return await getDefaultConfig()
}

async function saveConfig(config) {
  await SystemSettingsManager.promises.setSetting(
    'serviceApiEnabled',
    config.enabled
  )
  if (config.password) {
    await SystemSettingsManager.promises.setSetting(
      'serviceApiPassword',
      config.password
    )
  }
  await SystemSettingsManager.promises.setSetting(
    'serviceApiLocalhostOnly',
    config.localhostOnly
  )
}

export async function getServiceApiSettings(req, res, next) {
  try {
    const config = await loadConfig()
    res.json({
      enabled: config.enabled,
      hasPassword: !!config.password,
      localhostOnly: config.localhostOnly,
    })
  } catch (err) {
    logger.error({ err }, 'Error loading service API config')
    next(err)
  }
}

export async function updateServiceApiSettings(req, res, next) {
  try {
    const { enabled, password, localhostOnly } = req.body

    const config = await loadConfig()

    if (typeof enabled === 'boolean') {
      config.enabled = enabled
    }

    if (password && password.trim()) {
      config.password = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS)
    }

    if (typeof localhostOnly === 'boolean') {
      config.localhostOnly = localhostOnly
    }

    await saveConfig(config)

    // Update runtime settings
    if (!Settings.serviceApi) {
      Settings.serviceApi = {}
    }
    Settings.serviceApi.enabled = config.enabled
    Settings.serviceApi.password = config.password
    Settings.serviceApi.localhostOnly = config.localhostOnly

    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'Error updating service API config')
    next(err)
  }
}

export async function generateServiceApiPassword(req, res, next) {
  try {
    const password = crypto.randomBytes(32).toString('base64')
    res.json({ password })
  } catch (err) {
    logger.error({ err }, 'Error generating service API password')
    next(err)
  }
}

// Initialize config on startup
export async function initializeServiceApiConfig() {
  try {
    const config = await loadConfig()

    if (!Settings.serviceApi) {
      Settings.serviceApi = {}
    }
    Settings.serviceApi.enabled = config.enabled
    Settings.serviceApi.password = config.password
    Settings.serviceApi.localhostOnly = config.localhostOnly

    logger.info(
      { enabled: config.enabled, localhostOnly: config.localhostOnly },
      'Service API initialized'
    )
  } catch (err) {
    logger.error({ err }, 'Error initializing service API config')
  }
}

