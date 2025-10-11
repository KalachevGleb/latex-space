import { expressify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import DocumentUpdaterHandler from '../DocumentUpdater/DocumentUpdaterHandler.js'
import { db, ObjectId } from '../../infrastructure/mongodb.js'

async function setTrackChangesState(req, res) {
  const projectId = req.params.Project_id
  const { on, on_for: onFor } = req.body
  
  try {
    // Формируем состояние track changes
    let trackChangesState
    
    if (on !== undefined) {
      // Включить/выключить для всех
      trackChangesState = on
    } else if (onFor !== undefined) {
      // Включить/выключить для конкретных пользователей
      trackChangesState = onFor
    } else {
      return res.status(400).json({ error: 'Either "on" or "on_for" is required' })
    }
    
    // Обновляем статус в БД
    await db.projects.updateOne(
      { _id: new ObjectId(projectId) },
      { $set: { trackChangesState } }
    )
    
    // Отправляем socket event для синхронизации
    EditorRealTimeController.emitToRoom(
      projectId,
      'toggle-track-changes',
      trackChangesState
    )
    
    logger.info({ projectId, trackChangesState }, 'track changes state updated')
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, projectId }, 'error setting track changes state')
    res.status(500).json({ error: 'Failed to set track changes state' })
  }
}

async function acceptChanges(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.doc_id
  const { change_ids: changeIds } = req.body
  // Passport.js хранит пользователя в req.session.passport.user
  const userId = req.session?.passport?.user?._id || req.session?.user?._id
  
  if (!changeIds || !Array.isArray(changeIds)) {
    return res.status(400).json({ error: 'change_ids array is required' })
  }
  
  try {
    // Accept changes через DocumentUpdaterHandler
    await DocumentUpdaterHandler.promises.acceptChanges(
      projectId,
      docId,
      changeIds,
      userId?.toString()
    )
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'accept-changes', docId, changeIds)
    
    logger.info({ projectId, docId, changeIds }, 'accepted changes')
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, projectId, docId, changeIds }, 'error accepting changes')
    res.status(500).json({ error: 'Failed to accept changes' })
  }
}

export default {
  setTrackChangesState: expressify(setTrackChangesState),
  acceptChanges: expressify(acceptChanges),
}

