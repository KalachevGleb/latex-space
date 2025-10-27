import OError from '@overleaf/o-error'
import HttpErrorHandler from '../../Features/Errors/HttpErrorHandler.js'
import mongodb from 'mongodb-legacy'
import CollaboratorsHandler from './CollaboratorsHandler.js'
import CollaboratorsGetter from './CollaboratorsGetter.js'
import OwnershipTransferHandler from './OwnershipTransferHandler.mjs'
import SessionManager from '../Authentication/SessionManager.js'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import TagsHandler from '../Tags/TagsHandler.js'
import Errors from '../Errors/Errors.js'
import logger from '@overleaf/logger'
import { expressify } from '@overleaf/promise-utils'
import { hasAdminAccess } from '../Helpers/AdminAuthorizationHelper.js'
import TokenAccessHandler from '../TokenAccess/TokenAccessHandler.js'
import ProjectAuditLogHandler from '../Project/ProjectAuditLogHandler.mjs'
import LimitationsManager from '../Subscription/LimitationsManager.js'
import PrivilegeLevels from '../Authorization/PrivilegeLevels.js'
import { z, zz, validateReq } from '../../infrastructure/Validation.js'
import Features from '../../infrastructure/Features.js'
import UserGetter from '../User/UserGetter.js'
import EmailHelper from '../Helpers/EmailHelper.js'

const ObjectId = mongodb.ObjectId

export default {
  removeUserFromProject: expressify(removeUserFromProject),
  removeSelfFromProject: expressify(removeSelfFromProject),
  getAllMembers: expressify(getAllMembers),
  setCollaboratorInfo: expressify(setCollaboratorInfo),
  transferOwnership: expressify(transferOwnership),
  getShareTokens: expressify(getShareTokens),
  addUserDirectly: expressify(addUserDirectly),
}

async function removeUserFromProject(req, res, next) {
  const projectId = req.params.Project_id
  const userId = req.params.user_id
  const sessionUserId = SessionManager.getLoggedInUserId(req.session)
  await _removeUserIdFromProject(projectId, userId)
  EditorRealTimeController.emitToRoom(projectId, 'project:membership:changed', {
    members: true,
  })

  ProjectAuditLogHandler.addEntryInBackground(
    projectId,
    'remove-collaborator',
    sessionUserId,
    req.ip,
    { userId }
  )

  res.sendStatus(204)
}

async function removeSelfFromProject(req, res, next) {
  const projectId = req.params.Project_id
  const userId = SessionManager.getLoggedInUserId(req.session)
  await _removeUserIdFromProject(projectId, userId)

  ProjectAuditLogHandler.addEntryInBackground(
    projectId,
    'leave-project',
    userId,
    req.ip
  )

  res.sendStatus(204)
}

async function getAllMembers(req, res, next) {
  const projectId = req.params.Project_id
  logger.debug({ projectId }, 'getting all active members for project')
  let members
  try {
    members = await CollaboratorsGetter.promises.getAllInvitedMembers(projectId)
  } catch (err) {
    throw OError.tag(err, 'error getting members for project', { projectId })
  }
  res.json({ members })
}

const setCollaboratorInfoSchema = z.object({
  params: z.object({
    Project_id: zz.objectId(),
    user_id: zz.objectId(),
  }),
  body: z.object({
    privilegeLevel: z.enum([
      PrivilegeLevels.READ_ONLY,
      PrivilegeLevels.READ_AND_WRITE,
      PrivilegeLevels.REVIEW,
    ]),
  }),
})

async function setCollaboratorInfo(req, res, next) {
  try {
    const { params, body } = validateReq(req, setCollaboratorInfoSchema)
    const projectId = params.Project_id
    const userId = params.user_id
    const { privilegeLevel } = body

    const allowed =
      await LimitationsManager.promises.canChangeCollaboratorPrivilegeLevel(
        projectId,
        userId,
        privilegeLevel
      )
    if (!allowed) {
      return HttpErrorHandler.forbidden(
        req,
        res,
        'edit collaborator limit reached'
      )
    }

    await CollaboratorsHandler.promises.setCollaboratorPrivilegeLevel(
      projectId,
      userId,
      privilegeLevel
    )
    EditorRealTimeController.emitToRoom(
      projectId,
      'project:collaboratorAccessLevel:changed',
      { userId }
    )
    res.sendStatus(204)
  } catch (err) {
    if (err instanceof Errors.NotFoundError) {
      HttpErrorHandler.notFound(req, res)
    } else {
      next(err)
    }
  }
}

const transferOwnershipSchema = z.object({
  params: z.object({
    Project_id: zz.objectId(),
  }),
  body: z.object({
    user_id: zz.objectId(),
  }),
})

async function transferOwnership(req, res, next) {
  const sessionUser = SessionManager.getSessionUser(req.session)
  const { params, body } = validateReq(req, transferOwnershipSchema)
  const projectId = params.Project_id
  const toUserId = body.user_id
  try {
    await OwnershipTransferHandler.promises.transferOwnership(
      projectId,
      toUserId,
      {
        allowTransferToNonCollaborators: hasAdminAccess(sessionUser),
        sessionUserId: new ObjectId(sessionUser._id),
        ipAddress: req.ip,
      }
    )
    res.sendStatus(204)
  } catch (err) {
    if (err instanceof Errors.ProjectNotFoundError) {
      HttpErrorHandler.notFound(req, res, `project not found: ${projectId}`)
    } else if (err instanceof Errors.UserNotFoundError) {
      HttpErrorHandler.notFound(req, res, `user not found: ${toUserId}`)
    } else if (err instanceof Errors.UserNotCollaboratorError) {
      HttpErrorHandler.forbidden(
        req,
        res,
        `user ${toUserId} should be a collaborator in project ${projectId} prior to ownership transfer`
      )
    } else {
      next(err)
    }
  }
}

async function _removeUserIdFromProject(projectId, userId) {
  await CollaboratorsHandler.promises.removeUserFromProject(projectId, userId)
  EditorRealTimeController.emitToRoom(
    projectId,
    'userRemovedFromProject',
    userId
  )
  await TagsHandler.promises.removeProjectFromAllTags(userId, projectId)
}

async function getShareTokens(req, res) {
  const projectId = req.params.Project_id
  const userId = SessionManager.getLoggedInUserId(req.session)

  if (!Features.hasFeature('link-sharing')) {
    return res.sendStatus(403) // return Forbidden if link sharing is not enabled
  }

  let tokens
  if (userId) {
    tokens = await CollaboratorsGetter.promises.getPublicShareTokens(
      new ObjectId(userId),
      new ObjectId(projectId)
    )
  } else {
    // anonymous access, the token is already available in the session
    const readOnly = TokenAccessHandler.getRequestToken(req, projectId)
    tokens = { readOnly }
  }
  if (!tokens) {
    return res.sendStatus(403)
  }

  if (tokens.readOnly || tokens.readAndWrite) {
    logger.info(
      {
        projectId,
        userId: userId || 'anonymous',
        ip: req.ip,
        tokens: Object.keys(tokens),
      },
      'project tokens accessed'
    )
  }

  if (tokens.readOnly) {
    tokens.readOnlyHashPrefix = TokenAccessHandler.createTokenHashPrefix(
      tokens.readOnly
    )
  }

  if (tokens.readAndWrite) {
    tokens.readAndWriteHashPrefix = TokenAccessHandler.createTokenHashPrefix(
      tokens.readAndWrite
    )
  }

  res.json(tokens)
}

const addUserDirectlySchema = z.object({
  params: z.object({
    Project_id: zz.objectId(),
  }),
  body: z.object({
    email: z.string(),
    privileges: z.enum([
      PrivilegeLevels.READ_ONLY,
      PrivilegeLevels.READ_AND_WRITE,
      PrivilegeLevels.REVIEW,
    ]),
    isAnonymous: z.boolean().optional(),
  }),
})

async function addUserDirectly(req, res) {
  const { params, body } = validateReq(req, addUserDirectlySchema)
  const projectId = params.Project_id
  let { email, privileges, isAnonymous } = body
  const sendingUser = SessionManager.getSessionUser(req.session)
  const sendingUserId = sendingUser._id
  req.logger.addFields({ email, sendingUserId, isAnonymous })

  if (email === sendingUser.email) {
    logger.debug(
      { projectId, email, sendingUserId },
      'cannot add yourself to project'
    )
    return res.status(400).json({ error: 'cannot_add_self' })
  }

  logger.debug({ projectId, email, sendingUserId }, 'adding user directly to project')

  // Check collaborator limits
  let allowed = false
  if (privileges === PrivilegeLevels.READ_ONLY) {
    allowed = true
  } else {
    allowed = await LimitationsManager.promises.canAddXEditCollaborators(
      projectId,
      1
    )
  }

  if (!allowed) {
    logger.debug(
      { projectId, email, sendingUserId },
      'not allowed to add more users to project'
    )
    return res.status(403).json({ error: 'collaborator_limit_reached' })
  }

  // Parse and validate email
  email = EmailHelper.parseEmail(email, true)
  if (email == null || email === '') {
    logger.debug({ projectId, email, sendingUserId }, 'invalid email address')
    return res.status(400).json({ error: 'invalid_email' })
  }

  // Find user by email
  const user = await UserGetter.promises.getUserByAnyEmail(email, {
    _id: 1,
    email: 1,
  })

  if (user == null) {
    logger.debug(
      { email, projectId, sendingUserId },
      'user not found with this email'
    )
    return res.status(404).json({ error: 'user_not_found' })
  }

  // Check if user is already a member
  const isMember =
    await CollaboratorsGetter.promises.isUserInvitedMemberOfProject(
      user._id,
      projectId
    )

  if (isMember) {
    logger.debug(
      { projectId, userId: user._id, email },
      'user is already a member of the project'
    )
    return res.status(400).json({ error: 'user_already_member' })
  }

  // Add user directly to project
  await CollaboratorsHandler.promises.addUserIdToProject(
    projectId,
    sendingUserId,
    user._id,
    privileges,
    { isAnonymous }
  )

  ProjectAuditLogHandler.addEntryInBackground(
    projectId,
    'add-collaborator-direct',
    sendingUserId,
    req.ip,
    {
      userId: user._id,
      privileges,
      isAnonymous,
    }
  )

  logger.debug(
    { projectId, email, userId: user._id, sendingUserId },
    'user added directly to project'
  )

  EditorRealTimeController.emitToRoom(projectId, 'project:membership:changed', {
    members: true,
  })

  res.json({
    success: true,
    user: {
      _id: user._id,
      email: user.email,
      privileges,
    }
  })
}
