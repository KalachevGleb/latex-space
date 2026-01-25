const { callbackifyAll } = require('@overleaf/promise-utils')
const UserGetter = require('../User/UserGetter')
const Settings = require('@overleaf/settings')

async function getInstitutionsFeatures(userId) {
  return {}
}

async function getInstitutionsPlan(userId) {
  if (await hasLicence(userId)) {
    return Settings.institutionPlanCode
  }
  return null
}

async function hasLicence(userId) {
  const emailsData = await UserGetter.promises.getUserFullEmails(userId)
  return emailsData.some(emailData => emailData.emailHasInstitutionLicence)
}
const InstitutionsFeatures = {
  getInstitutionsFeatures,
  getInstitutionsPlan,
  hasLicence,
}
module.exports = {
  promises: InstitutionsFeatures,
  ...callbackifyAll(InstitutionsFeatures),
}
