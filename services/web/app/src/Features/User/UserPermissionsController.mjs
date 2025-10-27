import { expressify } from '@overleaf/promise-utils'
import UserPermissionsHandler from './UserPermissionsHandler.mjs'
import { z, validateReq } from '../../infrastructure/Validation.js'

const setUserPermissionsSchema = z.object({
  body: z.object({
    permissions: z.enum(['basic', 'full']),
  }),
  params: z.object({
    user_id: z.string(),
  }),
})

async function setUserPermissions(req, res) {
  const { body, params } = validateReq(req, setUserPermissionsSchema)
  const { permissions } = body
  const userId = params.user_id

  await UserPermissionsHandler.promises.setUserPermissions(userId, permissions)

  res.sendStatus(204)
}

async function getUserPermissions(req, res) {
  const userId = req.params.user_id

  const permissions = await UserPermissionsHandler.promises.getUserPermissions(
    userId
  )

  res.json({ permissions })
}

export default {
  setUserPermissions: expressify(setUserPermissions),
  getUserPermissions: expressify(getUserPermissions),
}
