import SystemSettingsManager from './SystemSettingsManager.mjs'
import logger from '@overleaf/logger'
import { hasAdminAccess } from '../Helpers/AdminAuthorizationHelper.js'
import SessionManager from '../Authentication/SessionManager.js'

async function ensureRegistrationEnabled(req, res, next) {
  try {
    const registrationEnabled =
      await SystemSettingsManager.promises.getSetting('registrationEnabled')

    // Проверяем, является ли пользователь администратором
    const user = SessionManager.getSessionUser(req.session)
    const isAdmin = hasAdminAccess(user)

    // Администраторы всегда могут видеть страницу регистрации
    if (isAdmin) {
      return next()
    }

    // Если регистрация выключена и пользователь не админ, показываем ошибку
    if (!registrationEnabled) {
      logger.info('Registration is disabled, redirecting to login')
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Registration Disabled</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background: #f5f5f5; 
            }
            .message-box { 
              background: white; 
              padding: 40px; 
              border-radius: 8px; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; }
            a { color: #4a90e2; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="message-box">
            <h1>Registration Disabled</h1>
            <p>User registration is currently disabled.</p>
            <p>Please contact an administrator for access.</p>
            <p><a href="/login">Return to Login</a></p>
          </div>
        </body>
        </html>
      `)
    }

    next()
  } catch (error) {
    logger.error({ error }, 'Error checking registration setting')
    // В случае ошибки разрешаем доступ (fail-open)
    next()
  }
}

export default {
  ensureRegistrationEnabled,
}

