import AuthorizationMiddleware from '../Authorization/AuthorizationMiddleware.mjs'
import AuthenticationController from '../Authentication/AuthenticationController.js'
import ProjectUploadController from './ProjectUploadController.mjs'
import { RateLimiter } from '../../infrastructure/RateLimiter.js'
import RateLimiterMiddleware from '../Security/RateLimiterMiddleware.mjs'
import Settings from '@overleaf/settings'

const rateLimiters = {
  projectUpload: new RateLimiter('project-upload', {
    points: 20,
    duration: 60,
  }),
  fileUpload: new RateLimiter('file-upload', {
    points: 500,
    duration: 60 * 15,
  }),
}

export default {
  apply(webRouter) {
    webRouter.post(
      '/project/new/upload',
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(rateLimiters.projectUpload),
      async (req, res, next) => {
        try {
          const SessionManager = (await import('../Authentication/SessionManager.js')).default
          const UserPermissionsHandler = (
            await import('../User/UserPermissionsHandler.mjs')
          ).default
          const currentUser = SessionManager.getSessionUser(req.session)
          const hasFullPermissions = await UserPermissionsHandler.promises.hasFullPermissions(
            currentUser._id
          )
          if (!hasFullPermissions) {
            return res.status(403).json({
              error: 'You do not have permission to upload projects'
            })
          }
        } catch (error) {
          console.warn('Error checking user permissions:', error)
        }
        return ProjectUploadController.multerMiddleware(req, res, next)
      },
      ProjectUploadController.uploadProject
    )

    const fileUploadEndpoint = '/Project/:Project_id/upload'
    const fileUploadRateLimit = RateLimiterMiddleware.rateLimit(
      rateLimiters.fileUpload,
      {
        params: ['Project_id'],
      }
    )
    if (Settings.allowAnonymousReadAndWriteSharing) {
      webRouter.post(
        fileUploadEndpoint,
        fileUploadRateLimit,
        AuthorizationMiddleware.ensureUserCanWriteProjectContent,
        ProjectUploadController.multerMiddleware,
        ProjectUploadController.uploadFile
      )
    } else {
      webRouter.post(
        fileUploadEndpoint,
        fileUploadRateLimit,
        AuthenticationController.requireLogin(),
        AuthorizationMiddleware.ensureUserCanWriteProjectContent,
        ProjectUploadController.multerMiddleware,
        ProjectUploadController.uploadFile
      )
    }
  },
}
