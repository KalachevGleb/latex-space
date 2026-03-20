import UserInviteController from './UserInviteController.mjs'

export default {
  apply(webRouter) {
    // Invite a new user by email (Service API only)
    // Returns the activation link on success.
    // Error 409 if a user with this email already exists.
    webRouter.post('/api/user/invite', UserInviteController.inviteUser)
  },
}
