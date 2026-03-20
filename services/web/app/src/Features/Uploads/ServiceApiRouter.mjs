import AuthorizationMiddleware from '../Authorization/AuthorizationMiddleware.mjs'
import ProjectUploadController from './ProjectUploadController.mjs'
import { RateLimiter } from '../../infrastructure/RateLimiter.js'
import RateLimiterMiddleware from '../Security/RateLimiterMiddleware.mjs'

const rateLimiters = {
  fileUploadByPath: new RateLimiter('file-upload-by-path', {
    points: 500,
    duration: 60 * 15,
  }),
  projectSyncFromZip: new RateLimiter('project-sync-from-zip', {
    points: 20,
    duration: 60,
  }),
}

export default {
  apply(webRouter) {
    // Upload file by path (Service API only)
    // Automatically creates folders based on the path
    // Preserves history when replacing files
    webRouter.post(
      '/project/:Project_id/upload-by-path',
      RateLimiterMiddleware.rateLimit(rateLimiters.fileUploadByPath, {
        params: ['Project_id'],
      }),
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      ProjectUploadController.multerMiddleware,
      ProjectUploadController.uploadFileByPath
    )

    // Sync project from ZIP (Service API only)
    // Deletes files not in ZIP, updates existing, adds new
    // Preserves history and comments
    webRouter.post(
      '/project/:Project_id/sync-from-zip',
      RateLimiterMiddleware.rateLimit(rateLimiters.projectSyncFromZip, {
        params: ['Project_id'],
      }),
      AuthorizationMiddleware.ensureUserCanWriteProjectContent,
      ProjectUploadController.multerMiddleware,
      ProjectUploadController.syncProjectFromZip
    )
  },
}
