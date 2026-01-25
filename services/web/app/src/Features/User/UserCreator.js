const logger = require('@overleaf/logger')
const util = require('util')
const Features = require('../../infrastructure/Features')
const { User } = require('../../models/User')
const Analytics = require('../Analytics/AnalyticsManager')
const UserOnboardingEmailManager = require('./UserOnboardingEmailManager')
const UserPostRegistrationAnalyticsManager = require('./UserPostRegistrationAnalyticsManager')
const OError = require('@overleaf/o-error')

async function recordRegistrationEvent(user) {
  try {
    const segmentation = {
      'home-registration': 'default',
    }
    if (user.thirdPartyIdentifiers && user.thirdPartyIdentifiers.length > 0) {
      segmentation.provider = user.thirdPartyIdentifiers[0].providerId
    }
    Analytics.recordEventForUserInBackground(
      user._id,
      'user-registered',
      segmentation
    )
  } catch (err) {
    logger.warn({ err }, 'there was an error recording `user-registered` event')
  }
}

async function createNewUser(attributes, options = {}) {
  let user = new User()

  if (attributes.first_name == null || attributes.first_name === '') {
    attributes.first_name = attributes.email.split('@')[0]
  }

  Object.assign(user, attributes)

  user.ace.syntaxValidation = true

  const reversedHostname = user.email.split('@')[1].split('').reverse().join('')

  const emailData = {
    email: user.email,
    createdAt: new Date(),
    reversedHostname,
  }
  if (options.confirmedAt) {
    emailData.confirmedAt = options.confirmedAt
  }
  user.emails = [emailData]

  // Set user permissions based on peer-review mode
  try {
    const SystemSettingsManager = require('../SystemSettings/SystemSettingsManager')
    const peerReviewMode = await SystemSettingsManager.promises.getSetting(
      'peerReviewMode'
    )
    user.permissions = peerReviewMode ? 'basic' : 'full'
  } catch (error) {
    logger.warn({ err: error }, 'Failed to check peer-review mode, defaulting to full permissions')
    user.permissions = 'full'
  }

  user = await user.save()

  await recordRegistrationEvent(user)
  await Analytics.setUserPropertyForUser(user._id, 'created-at', new Date())
  await Analytics.setUserPropertyForUser(user._id, 'user-id', user._id)
  if (attributes.analyticsId) {
    await Analytics.setUserPropertyForUser(
      user._id,
      'analytics-id',
      attributes.analyticsId
    )
  }

  if (Features.hasFeature('saas')) {
    try {
      await UserOnboardingEmailManager.scheduleOnboardingEmail(user)
      await UserPostRegistrationAnalyticsManager.schedulePostRegistrationAnalytics(
        user
      )
    } catch (error) {
      logger.error(
        OError.tag(error, 'Failed to schedule sending of onboarding email', {
          userId: user._id,
        })
      )
    }
  }

  return user
}

const UserCreator = {
  createNewUser: util.callbackify(createNewUser),
  promises: {
    createNewUser,
  },
}

module.exports = UserCreator
