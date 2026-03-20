import { expressify } from '@overleaf/promise-utils'
import UserRegistrationHandler from './UserRegistrationHandler.js'
import UserGetter from './UserGetter.js'
import EmailHelper from '../Helpers/EmailHelper.js'
import logger from '@overleaf/logger'

async function inviteUser(req, res) {
  if (!req.isServiceAuth) {
    return res.status(403).json({
      error: 'forbidden',
      error_description: 'This endpoint requires Service API authentication',
    })
  }

  const { email: rawEmail } = req.body

  if (!rawEmail || typeof rawEmail !== 'string') {
    return res.status(400).json({
      error: 'missing_email',
      error_description: 'Email address is required',
    })
  }

  const email = EmailHelper.parseEmail(rawEmail)
  if (!email) {
    return res.status(400).json({
      error: 'invalid_email',
      error_description: 'Invalid email address format',
    })
  }

  // Check if a real (non-holding) account already exists with this email
  const existingUser = await UserGetter.promises.getUserByAnyEmail(email)
  if (existingUser && !existingUser.holdingAccount) {
    logger.debug({ email }, 'Service API invite: user already exists')
    return res.status(409).json({
      error: 'email_already_registered',
      error_description: 'A user with this email already exists',
    })
  }

  // Create user and generate one-week activation token; sends activation email
  const { user, setNewPasswordUrl } =
    await UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail(
      email
    )

  logger.info({ userId: user._id, email: user.email }, 'Service API: user invited')

  return res.status(201).json({
    status: 'created',
    email: user.email,
    setNewPasswordUrl,
  })
}

export default {
  inviteUser: expressify(inviteUser),
}
