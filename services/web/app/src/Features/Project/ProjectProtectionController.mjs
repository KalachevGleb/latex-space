import { expressify } from '@overleaf/promise-utils'
import ProjectProtectionHandler from './ProjectProtectionHandler.mjs'
import SessionManager from '../Authentication/SessionManager.js'
import { z, validateReq } from '../../infrastructure/Validation.js'

const setProjectProtectionSchema = z.object({
  body: z.object({
    isProtected: z.boolean(),
  }),
  params: z.object({
    Project_id: z.string(),
  }),
})

const setProtectedFilesSchema = z.object({
  body: z.object({
    protectedFiles: z.array(z.string()),
  }),
  params: z.object({
    Project_id: z.string(),
  }),
})

async function setProjectProtection(req, res) {
  const { body, params } = validateReq(req, setProjectProtectionSchema)
  const { isProtected } = body
  const projectId = params.Project_id

  await ProjectProtectionHandler.promises.setProjectProtection(
    projectId,
    isProtected
  )

  res.sendStatus(204)
}

async function getProjectProtection(req, res) {
  const projectId = req.params.Project_id

  const protection =
    await ProjectProtectionHandler.promises.getProjectProtection(projectId)

  res.json(protection)
}

async function setProtectedFiles(req, res) {
  const { body, params } = validateReq(req, setProtectedFilesSchema)
  const { protectedFiles } = body
  const projectId = params.Project_id

  await ProjectProtectionHandler.promises.setProtectedFiles(
    projectId,
    protectedFiles
  )

  res.sendStatus(204)
}

async function getProtectedFiles(req, res) {
  const projectId = req.params.Project_id

  const protectedFiles =
    await ProjectProtectionHandler.promises.getProtectedFiles(projectId)

  res.json({ protectedFiles })
}

async function isFileProtected(req, res) {
  const projectId = req.params.Project_id
  const filePath = req.params.file_path

  const isProtected = await ProjectProtectionHandler.promises.isFileProtected(
    projectId,
    filePath
  )

  res.json({ isProtected })
}

export default {
  setProjectProtection: expressify(setProjectProtection),
  getProjectProtection: expressify(getProjectProtection),
  setProtectedFiles: expressify(setProtectedFiles),
  getProtectedFiles: expressify(getProtectedFiles),
  isFileProtected: expressify(isFileProtected),
}
