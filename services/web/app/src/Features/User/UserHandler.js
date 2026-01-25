const { callbackify } = require('util')
const {
  db,
  READ_PREFERENCE_SECONDARY,
} = require('../../infrastructure/mongodb')


async function countActiveUsers() {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return await db.users.countDocuments(
    { lastActive: { $gte: oneYearAgo } },
    { readPreference: READ_PREFERENCE_SECONDARY }
  )
}

module.exports = {
  countActiveUsers: callbackify(countActiveUsers),
  promises: {
    countActiveUsers,
  },
}
