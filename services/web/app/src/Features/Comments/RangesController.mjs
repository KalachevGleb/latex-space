import { expressify } from '@overleaf/promise-utils'
import DocstoreManager from '../Docstore/DocstoreManager.js'
import logger from '@overleaf/logger'
import { db, ObjectId } from '../../infrastructure/mongodb.js'

async function getAllRanges(req, res) {
  const projectId = req.params.Project_id
  
  try {
    // Получаем ranges из docstore
    const docRanges = await DocstoreManager.promises.getAllRanges(projectId)
    
    // Получаем информацию о resolved состояниях из нашей коллекции
    const threads = await db.projectHistoryComments
      .find({ project_id: new ObjectId(projectId) })
      .toArray()
    
    // Создаем map thread_id -> resolved status
    const threadResolvedMap = new Map()
    threads.forEach(thread => {
      threadResolvedMap.set(thread._id.toString(), thread.resolved || false)
    })
    
    // Обогащаем ranges информацией о resolved состоянии
    const enrichedRanges = docRanges.map(doc => {
      const comments = (doc.ranges?.comments || []).map(comment => {
        const threadId = comment.op?.t
        const isResolved = threadId ? threadResolvedMap.get(threadId) : false
        
        return {
          ...comment,
          resolved: isResolved || false,
        }
      })
      
      return {
        id: doc.id,
        ranges: {
          comments,
          changes: doc.ranges?.changes || [],
        },
      }
    })
    
    res.json(enrichedRanges)
  } catch (error) {
    logger.error({ err: error, projectId }, 'error getting all ranges')
    res.status(500).json({ error: 'Failed to get ranges' })
  }
}

export default {
  getAllRanges: expressify(getAllRanges),
}

