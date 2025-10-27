import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import UserGetter from '../../../../app/src/Features/User/UserGetter.js'
import UserRegistrationHandler from '../../../../app/src/Features/User/UserRegistrationHandler.js'
import ErrorController from '../../../../app/src/Features/Errors/ErrorController.mjs'
import { expressify } from '@overleaf/promise-utils'
import Settings from '@overleaf/settings'
import OError from '@overleaf/o-error'
import { ObjectId, db } from '../../../../app/src/infrastructure/mongodb.js'

const __dirname = Path.dirname(fileURLToPath(import.meta.url))

function registerNewUser(req, res, next) {
  res.render(Path.resolve(__dirname, '../views/user/register'))
}

async function register(req, res, next) {
  const { email } = req.body
  if (email == null || email === '') {
    return res.sendStatus(422) // Unprocessable Entity
  }

  try {
    // Сначала проверяем, существует ли уже активированный пользователь
    const existingUser = await UserGetter.promises.getUserByAnyEmail(email, {
      _id: 1,
      loginCount: 1,
      hashedPassword: 1,
    })

    if (existingUser && existingUser.loginCount > 0) {
      // Пользователь уже активирован (входил в систему)
      return res.status(409).json({
        message: {
          type: 'error',
          text: 'This email is already registered. Please log in instead.',
        },
      })
    }

    const { user, setNewPasswordUrl } =
      await UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail(
        email
      )

    // Проверяем, настроен ли email
    const emailEnabled =
      Settings.email &&
      Settings.email.parameters &&
      Settings.email.parameters.host

    // Если email не настроен, сразу перенаправляем на форму установки пароля
    if (!emailEnabled) {
      const activationUrl = setNewPasswordUrl.replace(
        Settings.siteUrl || 'http://localhost:3000',
        ''
      )
      return res.json({
        email: user.email,
        setNewPasswordUrl,
        redir: activationUrl, // Frontend перенаправит на эту страницу
      })
    }

    res.json({
      email: user.email,
      setNewPasswordUrl,
    })
  } catch (error) {
    // Проверяем, существует ли пользователь
    if (error.message === 'EmailAlreadyRegistered') {
      return res.status(409).json({
        message: {
          type: 'error',
          text: 'This email is already registered. Please log in instead.',
        },
      })
    }
    throw error
  }
}

async function activateAccountPage(req, res, next) {
  // An 'activation' is actually just a password reset on an account that
  // was set with a random password originally.
  if (req.query.user_id == null || req.query.token == null) {
    return ErrorController.notFound(req, res)
  }

  if (typeof req.query.user_id !== 'string') {
    return ErrorController.forbidden(req, res)
  }

  const user = await UserGetter.promises.getUser(req.query.user_id, {
    email: 1,
    loginCount: 1,
  })

  if (!user) {
    return ErrorController.notFound(req, res)
  }

  if (user.loginCount > 0) {
    // Already seen this user, so account must be activated.
    // This lets users keep clicking the 'activate' link in their email
    // as a way to log in which, if I know our users, they will.
    return res.redirect(`/login`)
  }

  req.session.doLoginAfterPasswordReset = true

  res.render(Path.resolve(__dirname, '../views/user/activate'), {
    title: 'activate_account',
    email: user.email,
    token: req.query.token,
  })
}

async function getUsersList(req, res) {
  const { search = '', page = 1, limit = 20 } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)
  
  // Построение фильтра поиска
  const searchFilter = search
    ? {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
        ],
      }
    : {}

  // Получаем пользователей
  const users = await db.users
    .find(searchFilter)
    .project({
      email: 1,
      first_name: 1,
      last_name: 1,
      isAdmin: 1,
      permissions: 1,
      loginCount: 1,
      lastLoggedIn: 1,
      createdAt: 1,
      signUpDate: 1,
    })
    .sort({ _id: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .toArray()

  // Получаем количество проектов для каждого пользователя
  const userIds = users.map(u => u._id)
  const projectCounts = await db.projects
    .aggregate([
      {
        $match: {
          $or: [
            { owner_ref: { $in: userIds } },
            { collaberator_refs: { $in: userIds } },
            { readOnly_refs: { $in: userIds } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          users: {
            $push: {
              owner: '$owner_ref',
              collaborators: '$collaberator_refs',
              readOnly: '$readOnly_refs',
            },
          },
        },
      },
    ])
    .toArray()

  // Подсчитываем проекты для каждого пользователя
  const userProjectCounts = {}
  if (projectCounts.length > 0) {
    for (const userId of userIds) {
      const userIdStr = userId.toString()
      const count = await db.projects.countDocuments({
        $or: [
          { owner_ref: userId },
          { collaberator_refs: userId },
          { readOnly_refs: userId },
        ],
      })
      userProjectCounts[userIdStr] = count
    }
  }

  // Формируем результат
  const usersWithStats = users.map(user => ({
    _id: user._id,
    email: user.email,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || '-',
    isAdmin: user.isAdmin || false,
    permissions: user.permissions || 'full',
    loginCount: user.loginCount || 0,
    lastLoggedIn: user.lastLoggedIn || null,
    createdAt: user.signUpDate || user.createdAt || null,
    projectCount: userProjectCounts[user._id.toString()] || 0,
  }))

  const total = await db.users.countDocuments(searchFilter)

  res.json({
    users: usersWithStats,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / parseInt(limit)),
  })
}

export default {
  registerNewUser,
  register: expressify(register),
  activateAccountPage: expressify(activateAccountPage),
  getUsersList: expressify(getUsersList),
}
