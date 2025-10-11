import { SystemSettings } from '../../models/SystemSettings.js'
import { callbackify } from '@overleaf/promise-utils'

const DEFAULT_SETTINGS = {
  registrationEnabled: false, // По умолчанию регистрация выключена
  defaultLanguage: 'en', // Язык сайта по умолчанию
}

async function getSetting(key) {
  const setting = await SystemSettings.findOne({ key }).exec()
  if (setting) {
    return setting.value
  }
  // Возвращаем значение по умолчанию, если настройка не найдена
  return DEFAULT_SETTINGS[key]
}

async function setSetting(key, value) {
  await SystemSettings.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true, new: true }
  ).exec()
}

async function getAllSettings() {
  const settings = await SystemSettings.find({}).exec()
  const result = { ...DEFAULT_SETTINGS }
  for (const setting of settings) {
    result[setting.key] = setting.value
  }
  return result
}

const SystemSettingsManager = {
  getSetting: callbackify(getSetting),
  setSetting: callbackify(setSetting),
  getAllSettings: callbackify(getAllSettings),
  promises: {
    getSetting,
    setSetting,
    getAllSettings,
  },
}

export default SystemSettingsManager

