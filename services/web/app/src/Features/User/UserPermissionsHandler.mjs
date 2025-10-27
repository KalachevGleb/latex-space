import { User } from '../../models/User.js'
import { callbackify } from 'node:util'

async function setUserPermissions(userId, permissions) {
  if (!['basic', 'full'].includes(permissions)) {
    throw new Error('Invalid permissions value. Must be "basic" or "full"')
  }

  await User.updateOne(
    { _id: userId },
    { $set: { permissions } }
  ).exec()
}

async function getUserPermissions(userId) {
  const user = await User.findById(userId, {
    permissions: 1,
  }).exec()

  if (!user) {
    throw new Error('User not found')
  }

  return user.permissions || 'full'
}

async function hasFullPermissions(userId) {
  const permissions = await getUserPermissions(userId)
  return permissions === 'full'
}

export default {
  setUserPermissions: callbackify(setUserPermissions),
  getUserPermissions: callbackify(getUserPermissions),
  hasFullPermissions: callbackify(hasFullPermissions),
  promises: {
    setUserPermissions,
    getUserPermissions,
    hasFullPermissions,
  },
}
