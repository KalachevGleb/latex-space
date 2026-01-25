const Queues = require('../../infrastructure/Queues')
const UserGetter = require('./UserGetter')

const ONE_DAY_MS = 24 * 60 * 60 * 1000

async function schedulePostRegistrationAnalytics(user) {
  await Queues.createScheduledJob(
    'post-registration-analytics',
    { data: { userId: user._id } },
    ONE_DAY_MS
  )
}

async function postRegistrationAnalytics(userId) {
  const user = await UserGetter.promises.getUser({ _id: userId }, { email: 1 })
  if (!user) {
    return
  }
}

module.exports = {
  schedulePostRegistrationAnalytics,
  postRegistrationAnalytics,
}
