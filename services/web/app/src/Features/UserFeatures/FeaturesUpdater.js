const _ = require('lodash')
const { callbackify } = require('util')
const { callbackifyMultiResult } = require('@overleaf/promise-utils')
const UserFeaturesUpdater = require('./UserFeaturesUpdater')
const FeaturesHelper = require('./FeaturesHelper')
const Settings = require('@overleaf/settings')
const logger = require('@overleaf/logger')
const UserGetter = require('../User/UserGetter')
const AnalyticsManager = require('../Analytics/AnalyticsManager')
const Queues = require('../../infrastructure/Queues')
const Modules = require('../../infrastructure/Modules')

/**
 * Enqueue a job for refreshing features for the given user
 */
async function scheduleRefreshFeatures(userId, reason) {
  const queue = Queues.getQueue('refresh-features')
  await queue.add({ userId, reason })
}

/* Check if user features refresh if needed, based on the global featuresEpoch setting */
function featuresEpochIsCurrent(user) {
  return Settings.featuresEpoch
    ? user.featuresEpoch === Settings.featuresEpoch
    : true
}

/**
 * Refresh features for the given user
 */
async function refreshFeatures(userId, reason) {
  const user = await UserGetter.promises.getUser(userId, {
    _id: 1,
    features: 1,
    featuresOverrides: 1,
  })
  const oldFeatures = _.clone(user.features)
  const features = await computeFeatures(user)
  logger.debug({ userId, features }, 'updating user features')

  const matchedFeatureSet = FeaturesHelper.getMatchedFeatureSet(features)
  AnalyticsManager.setUserPropertyForUserInBackground(
    userId,
    'feature-set',
    matchedFeatureSet
  )

  const { features: newFeatures, featuresChanged } =
    await UserFeaturesUpdater.promises.updateFeatures(userId, features)
  if (oldFeatures.dropbox === true && features.dropbox === false) {
    logger.debug({ userId }, '[FeaturesUpdater] must unlink dropbox')
    try {
      await Modules.promises.hooks.fire('removeDropbox', userId, reason)
    } catch (err) {
      logger.error({ err, userId }, 'removeDropbox hook failed')
    }
  }

  if (oldFeatures.github === true && features.github === false) {
    logger.debug({ userId }, '[FeaturesUpdater] must unlink github')
    try {
      await Modules.promises.hooks.fire('removeGithub', userId, reason)
    } catch (err) {
      logger.error({ err, userId }, 'removeGithub hook failed')
    }
  }

  return { features: newFeatures, featuresChanged }
}

/**
 * Return the features that the given user should have.
 */
async function computeFeatures(userOrId) {
  const user =
    typeof userOrId === 'object'
      ? userOrId
      : await UserGetter.promises.getUser(userOrId, { featuresOverrides: 1 })

  const featuresOverrides = _getFeaturesOverrides(user)
  const baseFeatures = _.clone(Settings.defaultFeatures || {})

  return FeaturesHelper.mergeFeatures(baseFeatures, featuresOverrides)
}

function _getFeaturesOverrides(user) {
  if (!user || !user.featuresOverrides || user.featuresOverrides.length === 0) {
    return {}
  }
  const activeFeaturesOverrides = []
  for (const featuresOverride of user.featuresOverrides) {
    if (
      !featuresOverride.expiresAt ||
      featuresOverride.expiresAt > new Date()
    ) {
      activeFeaturesOverrides.push(featuresOverride.features)
    }
  }
  return _.reduce(activeFeaturesOverrides, FeaturesHelper.mergeFeatures, {})
}

module.exports = {
  featuresEpochIsCurrent,
  computeFeatures: callbackify(computeFeatures),
  refreshFeatures: callbackifyMultiResult(refreshFeatures, [
    'features',
    'featuresChanged',
  ]),
  scheduleRefreshFeatures: callbackify(scheduleRefreshFeatures),
  promises: {
    computeFeatures,
    refreshFeatures,
    scheduleRefreshFeatures,
  },
}
