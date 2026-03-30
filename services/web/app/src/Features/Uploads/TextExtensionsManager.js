// @ts-check

const Settings = require('@overleaf/settings')

const BASE_TEXT_EXTENSIONS = Array.isArray(Settings.textExtensions)
  ? [...Settings.textExtensions]
  : []

function normalizeExtension(extension) {
  if (typeof extension !== 'string') {
    return null
  }
  const normalized = extension.trim().toLowerCase().replace(/^\./, '')
  return normalized.length > 0 ? normalized : null
}

function parseAdditionalTextExtensions(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const unique = new Set()
  for (const extension of source) {
    const normalized = normalizeExtension(extension)
    if (normalized != null) {
      unique.add(normalized)
    }
  }

  return [...unique]
}

function applyAdditionalTextExtensions(value) {
  const additionalTextExtensions = parseAdditionalTextExtensions(value)
  Settings.additionalTextExtensions = additionalTextExtensions
  Settings.textExtensions = [
    ...new Set([...BASE_TEXT_EXTENSIONS, ...additionalTextExtensions]),
  ]
  return Settings.textExtensions
}

module.exports = {
  parseAdditionalTextExtensions,
  applyAdditionalTextExtensions,
}
