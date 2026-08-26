import { expressify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'
import UserCreator from './UserCreator.js'
import UserGetter from './UserGetter.js'
import EmailHelper from '../Helpers/EmailHelper.js'

const MAX_NAME_LENGTH = 255

function parseName(value, field) {
  if (value == null) {
    return ''
  }
  if (typeof value !== 'string' || value.length > MAX_NAME_LENGTH) {
    throw new Error(
      `${field} must be a string of at most ${MAX_NAME_LENGTH} characters`
    )
  }
  return value.trim()
}

/**
 * Create a user account without sending any e-mail (Service API only).
 *
 * Intended for service/bot accounts (e.g. an AI reviewer): the e-mail does not
 * need to be deliverable, it is marked as confirmed, and no password is set,
 * so the account cannot be used to log in interactively. The account is used
 * via X-Overleaf-User-Id / X-Overleaf-User-Email in Service API requests.
 *
 * POST /api/user/create
 * Body: { email, first_name?, last_name? }
 */
async function createUser(req, res) {
  if (!req.isServiceAuth) {
    return res.status(403).json({
      error: 'forbidden',
      error_description: 'This endpoint requires Service API authentication',
    })
  }

  const { email: rawEmail } = req.body || {}
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

  let firstName, lastName
  try {
    firstName = parseName(req.body.first_name, 'first_name')
    lastName = parseName(req.body.last_name, 'last_name')
  } catch (err) {
    return res.status(400).json({
      error: 'invalid_name',
      error_description: err.message,
    })
  }

  const existingUser = await UserGetter.promises.getUserByAnyEmail(email, {
    _id: 1,
  })
  if (existingUser) {
    return res.status(409).json({
      error: 'email_already_registered',
      error_description: 'A user with this email already exists',
      user_id: existingUser._id.toString(),
    })
  }

  const user = await UserCreator.promises.createNewUser(
    {
      email,
      first_name: firstName,
      last_name: lastName,
    },
    { confirmedAt: new Date() }
  )

  logger.info(
    { userId: user._id, email: user.email },
    'Service API: user created'
  )

  return res.status(201).json({
    status: 'created',
    user_id: user._id.toString(),
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  })
}

export default {
  createUser: expressify(createUser),
}
