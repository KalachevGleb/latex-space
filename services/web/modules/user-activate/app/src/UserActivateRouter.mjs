import logger from '@overleaf/logger'
import UserActivateController from './UserActivateController.mjs'
import AuthenticationController from '../../../../app/src/Features/Authentication/AuthenticationController.js'
import AuthorizationMiddleware from '../../../../app/src/Features/Authorization/AuthorizationMiddleware.mjs'
import SystemSettingsMiddleware from '../../../../app/src/Features/SystemSettings/SystemSettingsMiddleware.mjs'

export default {
  apply(webRouter) {
    logger.debug({}, 'Init UserActivate router')

    webRouter.get(
      '/admin/user',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      (req, res) => res.redirect('/admin/register')
    )

    webRouter.get('/user/activate', UserActivateController.activateAccountPage)
    AuthenticationController.addEndpointToLoginWhitelist('/user/activate')

    webRouter.get(
      '/admin/register',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.registerNewUser
    )
    webRouter.post(
      '/admin/register',
      SystemSettingsMiddleware.ensureRegistrationEnabled,
      UserActivateController.register
    )
    
    webRouter.get(
      '/admin/users/list',
      AuthorizationMiddleware.ensureUserIsSiteAdmin,
      UserActivateController.getUsersList
    )
  },
}
