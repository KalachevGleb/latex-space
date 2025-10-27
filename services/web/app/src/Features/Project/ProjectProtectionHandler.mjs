import { Project } from '../../models/Project.js'
import { callbackify } from 'node:util'

async function setProjectProtection(projectId, isProtected) {
  await Project.updateOne(
    { _id: projectId },
    { $set: { isProtected } }
  ).exec()
}

async function getProjectProtection(projectId) {
  const project = await Project.findById(projectId, {
    isProtected: 1,
  }).exec()

  if (!project) {
    throw new Error('Project not found')
  }

  return {
    isProtected: project.isProtected || false,
  }
}

async function setProtectedFiles(projectId, protectedFiles) {
  await Project.updateOne(
    { _id: projectId },
    { $set: { protectedFiles } }
  ).exec()
}

async function getProtectedFiles(projectId) {
  const project = await Project.findById(projectId, {
    protectedFiles: 1,
  }).exec()

  if (!project) {
    throw new Error('Project not found')
  }

  return project.protectedFiles || []
}

async function isFileProtected(projectId, filePath) {
  const project = await Project.findById(projectId, {
    protectedFiles: 1,
  }).exec()

  if (!project) {
    throw new Error('Project not found')
  }

  const protectedFiles = project.protectedFiles || []
  return protectedFiles.includes(filePath)
}

async function isProjectProtected(projectId) {
  const project = await Project.findById(projectId, {
    isProtected: 1,
  }).exec()

  if (!project) {
    return false
  }

  return project.isProtected || false
}

export default {
  setProjectProtection: callbackify(setProjectProtection),
  getProjectProtection: callbackify(getProjectProtection),
  setProtectedFiles: callbackify(setProtectedFiles),
  getProtectedFiles: callbackify(getProtectedFiles),
  isFileProtected: callbackify(isFileProtected),
  isProjectProtected: callbackify(isProjectProtected),
  promises: {
    setProjectProtection,
    getProjectProtection,
    setProtectedFiles,
    getProtectedFiles,
    isFileProtected,
    isProjectProtected,
  },
}
