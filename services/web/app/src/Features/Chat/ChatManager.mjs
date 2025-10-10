import UserInfoController from '../User/UserInfoController.js'
import UserGetter from '../User/UserGetter.js'
import { callbackify } from '@overleaf/promise-utils'

async function injectUserInfoIntoThreads(threads, memberAliases = {}) {
  const userIds = new Set()
  for (const thread of Object.values(threads)) {
    if (thread.resolved) {
      userIds.add(thread.resolved_by_user_id)
    }
    for (const message of thread.messages) {
      userIds.add(message.user_id)
    }
  }

  const projection = {
    _id: true,
    first_name: true,
    last_name: true,
    email: true,
  }
  const users = await UserGetter.promises.getUsers(userIds, projection)
  const usersById = new Map()
  for (const user of users) {
    const userInfo = UserInfoController.formatPersonalInfo(user)
    const userId = user._id.toString()
    // Add alias if present for this user
    if (memberAliases[userId]) {
      userInfo.alias = memberAliases[userId]
    }
    usersById.set(userId, userInfo)
  }
  for (const thread of Object.values(threads)) {
    if (thread.resolved) {
      thread.resolved_by_user = usersById.get(thread.resolved_by_user_id)
    }
    for (const message of thread.messages) {
      message.user = usersById.get(message.user_id)
    }
  }
  return threads
}

export default {
  injectUserInfoIntoThreads: callbackify(injectUserInfoIntoThreads),
  promises: {
    injectUserInfoIntoThreads,
  },
}
