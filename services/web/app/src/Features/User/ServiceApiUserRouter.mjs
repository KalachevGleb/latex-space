import UserInviteController from './UserInviteController.mjs'
import ServiceApiUserController from './ServiceApiUserController.mjs'

export default {
  apply(webRouter) {
    // Invite a new user by email (Service API only)
    // Returns the activation link on success.
    // Error 409 if a user with this email already exists.
    webRouter.post('/api/user/invite', UserInviteController.inviteUser)

    // Create a user without sending any e-mail (Service API only).
    // Meant for bot/service accounts, e.g. an AI reviewer.
    webRouter.post('/api/user/create', ServiceApiUserController.createUser)
  },
}
