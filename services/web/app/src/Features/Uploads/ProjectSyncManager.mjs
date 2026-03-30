import logger from '@overleaf/logger'
import fs from 'node:fs/promises'
import Path from 'path'
import ArchiveManager from './ArchiveManager.js'
import FileTypeManager from './FileTypeManager.js'
import EditorController from '../Editor/EditorController.js'
import ProjectEntityUpdateHandler from '../Project/ProjectEntityUpdateHandler.js'
import ProjectGetter from '../Project/ProjectGetter.js'
import { promisify } from 'util'

/**
 * Synchronize project from ZIP archive
 * - Deletes files not in ZIP
 * - Updates existing files
 * - Adds new files
 */
async function syncProjectFromZip(projectId, userId, zipPath) {
  logger.info({ projectId, zipPath }, 'starting project sync from zip')

  // Extract ZIP to temporary directory
  const extractPath = `${zipPath}-extracted`
  await ArchiveManager.promises.extractZipArchive(zipPath, extractPath)

  // Find top-level directory in ZIP (if exists)
  const topLevelDir = await ArchiveManager.promises.findTopLevelDirectory(
    extractPath
  )

  try {
    // Get current project structure
    const project = await ProjectGetter.promises.getProject(projectId, {
      rootFolder: true,
      name: true,
    })

    if (!project) {
      throw new Error('Project not found')
    }

    // Build map of files in ZIP
    const zipFiles = await buildFileMap(topLevelDir)

    // Build map of files in project
    const projectFiles = await buildProjectFileMap(project)

    // Calculate operations
    const operations = calculateSyncOperations(zipFiles, projectFiles)

    logger.info(
      {
        projectId,
        toDelete: operations.toDelete.length,
        toUpdate: operations.toUpdate.length,
        toAdd: operations.toAdd.length,
      },
      'calculated sync operations'
    )

    // Execute operations
    await executeSyncOperations(
      projectId,
      userId,
      operations,
      topLevelDir,
      project
    )

    // Clean up
    await fs.rm(extractPath, { recursive: true, force: true })

    return {
      success: true,
      deleted: operations.toDelete.length,
      updated: operations.toUpdate.length,
      added: operations.toAdd.length,
    }
  } catch (error) {
    // Clean up on error
    await fs.rm(extractPath, { recursive: true, force: true })
    throw error
  }
}

/**
 * Build a map of files from extracted ZIP directory
 */
async function buildFileMap(dirPath, basePath = '') {
  const files = new Map()

  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
    const fullPath = Path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Recursively process subdirectories
      const subFiles = await buildFileMap(fullPath, relativePath)
      for (const [path, info] of subFiles) {
        files.set(path, info)
      }
    } else if (entry.isFile()) {
      // Store file info
      files.set(`/${relativePath}`, {
        path: `/${relativePath}`,
        fullPath,
        name: entry.name,
      })
    }
  }

  return files
}

/**
 * Build a map of files in project
 */
async function buildProjectFileMap(project) {
  const files = new Map()

  function processFolder(folder, basePath = '') {
    // Process docs
    for (const doc of folder.docs || []) {
      const path = basePath ? `${basePath}/${doc.name}` : `/${doc.name}`
      files.set(path, {
        id: doc._id.toString(),
        name: doc.name,
        type: 'doc',
        path,
      })
    }

    // Process files
    for (const file of folder.fileRefs || []) {
      const path = basePath ? `${basePath}/${file.name}` : `/${file.name}`
      files.set(path, {
        id: file._id.toString(),
        name: file.name,
        type: 'file',
        path,
      })
    }

    // Process subfolders recursively
    for (const subfolder of folder.folders || []) {
      const subPath = basePath
        ? `${basePath}/${subfolder.name}`
        : `/${subfolder.name}`
      processFolder(subfolder, subPath)
    }
  }

  processFolder(project.rootFolder[0])
  return files
}

/**
 * Calculate what operations need to be performed
 */
function calculateSyncOperations(zipFiles, projectFiles) {
  const toDelete = []
  const toUpdate = []
  const toAdd = []

  // Find files to delete or update
  for (const [path, projectFile] of projectFiles) {
    if (!zipFiles.has(path)) {
      // File exists in project but not in ZIP - delete it
      toDelete.push(projectFile)
    } else {
      // File exists in both - update it
      toUpdate.push({
        projectFile,
        zipFile: zipFiles.get(path),
      })
    }
  }

  // Find files to add
  for (const [path, zipFile] of zipFiles) {
    if (!projectFiles.has(path)) {
      // File exists in ZIP but not in project - add it
      toAdd.push(zipFile)
    }
  }

  return { toDelete, toUpdate, toAdd }
}

/**
 * Execute sync operations
 */
async function executeSyncOperations(
  projectId,
  userId,
  operations,
  zipBasePath,
  project
) {
  // 1. Delete files not in ZIP
  for (const file of operations.toDelete) {
    try {
      await EditorController.promises.deleteEntity(
        projectId,
        file.id,
        file.type,
        'upload-sync',
        userId
      )
      logger.info({ projectId, path: file.path }, 'deleted file during sync')
    } catch (error) {
      logger.error(
        { err: error, projectId, path: file.path },
        'error deleting file during sync'
      )
      // Continue with other operations
    }
  }

  // 2. Update existing files (using upsert to preserve history)
  for (const { projectFile, zipFile } of operations.toUpdate) {
    try {
      await upsertFileFromZip(projectId, userId, zipFile, 'upload-sync')
      logger.info({ projectId, path: zipFile.path }, 'updated file during sync')
    } catch (error) {
      logger.error(
        { err: error, projectId, path: zipFile.path },
        'error updating file during sync'
      )
      // Continue with other operations
    }
  }

  // 3. Add new files (using upsert which handles both add and update)
  for (const zipFile of operations.toAdd) {
    try {
      await upsertFileFromZip(projectId, userId, zipFile, 'upload-sync')
      logger.info({ projectId, path: zipFile.path }, 'added file during sync')
    } catch (error) {
      logger.error(
        { err: error, projectId, path: zipFile.path },
        'error adding file during sync'
      )
      // Continue with other operations
    }
  }
}

/**
 * Upsert a file from ZIP to project (preserves history and comments)
 */
async function upsertFileFromZip(projectId, userId, zipFile, source) {
  const isDoc = FileTypeManager.isTextFilename(zipFile.name)

  if (isDoc) {
    // Read file content as lines
    const content = await fs.readFile(zipFile.fullPath, 'utf8')
    const lines = content.split(/\r?\n/)

    // Use upsertDocWithPath to preserve history and comments
    await ProjectEntityUpdateHandler.promises.upsertDocWithPath(
      projectId,
      zipFile.path,
      lines,
      source,
      userId
    )
  } else {
    // Binary file - use upsertFileWithPath to preserve history
    await ProjectEntityUpdateHandler.promises.upsertFileWithPath(
      projectId,
      zipFile.path,
      zipFile.fullPath,
      null, // linkedFileData
      userId,
      source
    )
  }
}

export default {
  syncProjectFromZip: promisify(syncProjectFromZip),
  promises: {
    syncProjectFromZip,
  },
}
