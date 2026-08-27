import logger from '@overleaf/logger'
import { db, ObjectId } from '../../infrastructure/mongodb.js'
import UserGetter from '../User/UserGetter.js'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import ProjectGetter from '../Project/ProjectGetter.js'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.js'
import DocstoreManager from '../Docstore/DocstoreManager.js'
import DocumentUpdaterHandler from '../DocumentUpdater/DocumentUpdaterHandler.js'

/**
 * Load the public view of a message author, including the project alias.
 * Returns null when the user cannot be found.
 */
async function getMessageUserView(projectId, userId, memberAliases) {
  if (!userId) {
    return null
  }
  if (memberAliases == null) {
    const project = await ProjectGetter.promises.getProject(projectId, {
      memberAliases: 1,
    })
    memberAliases = project?.memberAliases || {}
  }
  const userIdString = userId.toString()
  try {
    const user = await UserGetter.promises.getUser(userIdString, {
      email: 1,
      first_name: 1,
      last_name: 1,
    })
    if (!user) {
      return null
    }
    return {
      id: userIdString,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      alias: memberAliases[userIdString],
    }
  } catch (err) {
    logger.warn({ err, userId }, 'error getting user for thread message')
    return null
  }
}

/**
 * Append a message to a comment thread (creating the thread if needed) and
 * notify connected editors. Shared by the browser and Service API flows.
 *
 * @returns {Promise<object>} the message with its author, as sent to clients
 */
export async function addMessage(projectId, threadId, userId, content) {
  const messageId = new ObjectId()
  const timestamp = new Date()

  const message = {
    id: messageId.toString(),
    content,
    timestamp,
    user_id: userId ? new ObjectId(userId) : null,
  }

  const existingThread = await db.projectHistoryComments.findOne({
    _id: new ObjectId(threadId),
  })

  if (existingThread) {
    await db.projectHistoryComments.updateOne(
      { _id: new ObjectId(threadId) },
      {
        $push: { messages: message },
        $set: { updated_at: timestamp },
      }
    )
  } else {
    await db.projectHistoryComments.insertOne({
      _id: new ObjectId(threadId),
      project_id: new ObjectId(projectId),
      messages: [message],
      resolved: false,
      created_at: timestamp,
      updated_at: timestamp,
    })
  }

  const responseMessage = {
    id: messageId.toString(),
    content,
    timestamp,
    user: await getMessageUserView(projectId, userId),
  }

  EditorRealTimeController.emitToRoom(
    projectId,
    'new-comment',
    threadId,
    responseMessage
  )

  return responseMessage
}

/**
 * Remove a thread that has no range in any document (used to roll back a
 * failed Service API comment).
 */
export async function deleteThreadById(projectId, threadId) {
  await db.projectHistoryComments.deleteOne({
    _id: new ObjectId(threadId),
    project_id: new ObjectId(projectId),
  })
  EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)
}

async function getChangesUsers(req, res) {
  const projectId = req.params.Project_id
  
  try {
    // Получаем псевдонимы из проекта
    const project = await ProjectGetter.promises.getProject(projectId, {
      memberAliases: 1,
    })
    const memberAliases = project?.memberAliases || {}
    
    // Получаем всех пользователей, которые делали изменения в проекте
    const threads = await db.projectHistoryComments
      .find({ project_id: new ObjectId(projectId) })
      .toArray()
    
    // Собираем уникальные ID пользователей
    const userIds = new Set()
    threads.forEach(thread => {
      thread.messages?.forEach(message => {
        if (message.user_id) {
          userIds.add(message.user_id.toString())
        }
      })
    })

    // Авторы tracked changes (могут уже не быть участниками проекта,
    // например бот-пользователь, добавлявший правки через Service API)
    try {
      const docRanges = await DocstoreManager.promises.getAllRanges(projectId)
      for (const doc of docRanges) {
        for (const change of doc.ranges?.changes || []) {
          if (change.metadata?.user_id) {
            userIds.add(change.metadata.user_id.toString())
          }
        }
      }
    } catch (err) {
      logger.warn({ err, projectId }, 'error getting ranges for changes users')
    }
    
    // Получаем информацию о пользователях
    const users = []
    for (const userId of userIds) {
      try {
        const user = await UserGetter.promises.getUser(userId, {
          email: 1,
          first_name: 1,
          last_name: 1,
        })
        if (user) {
          const userObj = {
            id: userId,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
          }
          // Добавляем псевдоним если он есть
          if (memberAliases[userId]) {
            userObj.alias = memberAliases[userId]
          }
          users.push(userObj)
        }
      } catch (err) {
        logger.warn({ err, userId }, 'error getting user for changes')
      }
    }
    
    res.json(users)
  } catch (error) {
    logger.error({ err: error, projectId }, 'error getting changes users')
    res.status(500).json({ error: 'Failed to get changes users' })
  }
}

async function getThreads(req, res) {
  const projectId = req.params.Project_id
  
  try {
    // Получаем псевдонимы из проекта
    const project = await ProjectGetter.promises.getProject(projectId, {
      memberAliases: 1,
    })
    const memberAliases = project?.memberAliases || {}
    
    const threads = await db.projectHistoryComments
      .find({ project_id: new ObjectId(projectId) })
      .toArray()
    
    // Преобразуем в формат, ожидаемый frontend
    const threadsById = {}
    
    for (const thread of threads) {
      // Получаем информацию о пользователях для каждого сообщения
      const messagesWithUsers = []
      for (const message of thread.messages || []) {
        let user = null
        if (message.user_id) {
          try {
            const userId = message.user_id.toString()
            user = await UserGetter.promises.getUser(userId, {
              email: 1,
              first_name: 1,
              last_name: 1,
            })
            // Добавляем псевдоним если он есть
            if (user && memberAliases[userId]) {
              user.alias = memberAliases[userId]
            }
          } catch (err) {
            logger.warn({ err, userId: message.user_id }, 'error getting user for thread message')
          }
        }
        
        messagesWithUsers.push({
          id: message.id,
          content: message.content,
          timestamp: message.timestamp,
          user: user ? {
            id: message.user_id.toString(),
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            alias: user.alias,
          } : null,
        })
      }
      
      threadsById[thread._id.toString()] = {
        id: thread._id.toString(),
        messages: messagesWithUsers,
        resolved: thread.resolved || false,
      }
    }
    
    res.json(threadsById)
  } catch (error) {
    logger.error({ err: error, projectId }, 'error getting threads')
    res.status(500).json({ error: 'Failed to get threads' })
  }
}

async function createMessage(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  const { content } = req.body
  // Passport.js хранит пользователя в req.session.passport.user;
  // Service API кладёт пользователя в req.session.user
  // Браузер: пользователь в сессии (passport); Service API: сессии нет,
  // пользователь в req.user
  const userId =
    req.user?._id ||
    req.session?.passport?.user?._id ||
    req.session?.user?._id

  if (!content) {
    return res.status(400).json({ error: 'Content is required' })
  }

  try {
    const responseMessage = await addMessage(
      projectId,
      threadId,
      userId,
      content
    )
    res.json(responseMessage)
  } catch (error) {
    logger.error({ err: error, projectId, threadId }, 'error creating message')
    res.status(500).json({ error: 'Failed to create message' })
  }
}

/**
 * Найти документ проекта, содержащий диапазон комментария threadId.
 * Возвращает id документа или null.
 */
async function findDocWithComment(projectId, threadId) {
  await DocumentUpdaterHandler.promises.flushProjectToMongo(projectId)
  const docRanges = await DocstoreManager.promises.getAllRanges(projectId)
  for (const doc of docRanges) {
    const comments = doc.ranges?.comments || []
    if (comments.some(comment => comment.op?.t === threadId)) {
      return (doc.id ?? doc._id).toString()
    }
  }
  return null
}

/**
 * Удалить диапазон комментария из документа. Если в docId диапазона нет
 * (например, клиент передал id открытого документа, а комментарий в другом),
 * документ ищется по всем документам проекта.
 */
async function removeCommentRange(projectId, docId, threadId, userId) {
  let targetDocId = docId
  try {
    const doc = await DocumentUpdaterHandler.promises.getDocument(
      projectId,
      docId,
      -1
    )
    const comments = doc.ranges?.comments || []
    if (!comments.some(comment => comment.op?.t === threadId)) {
      targetDocId = await findDocWithComment(projectId, threadId)
    }
  } catch (err) {
    logger.warn(
      { err, projectId, docId, threadId },
      'could not read doc while deleting thread, searching all docs'
    )
    targetDocId = await findDocWithComment(projectId, threadId)
  }

  if (!targetDocId) {
    logger.debug({ projectId, threadId }, 'no comment range found for thread')
    return
  }

  await DocumentUpdaterHandler.promises.deleteThread(
    projectId,
    targetDocId,
    threadId,
    userId
  )
}

async function deleteThread(req, res) {
  const projectId = req.params.Project_id
  const docId = req.params.Doc_id
  const threadId = req.params.thread_id
  const userId =
    req.user?._id ||
    req.session?.passport?.user?._id ||
    req.session?.user?._id

  try {
    // Убираем диапазон комментария из документа (document-updater),
    // иначе в ranges остаётся «сирота» без треда
    await removeCommentRange(projectId, docId, threadId, userId?.toString())

    await db.projectHistoryComments.deleteOne({ _id: new ObjectId(threadId) })

    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'delete-thread', threadId)
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, threadId }, 'error deleting thread')
    res.status(500).json({ error: 'Failed to delete thread' })
  }
}

async function resolveThread(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  // Passport.js хранит пользователя в req.session.passport.user
  // Браузер: пользователь в сессии (passport); Service API: сессии нет,
  // пользователь в req.user
  const userId =
    req.user?._id ||
    req.session?.passport?.user?._id ||
    req.session?.user?._id
  
  try {
    await db.projectHistoryComments.updateOne(
      { _id: new ObjectId(threadId) },
      { 
        $set: { 
          resolved: true,
          resolved_at: new Date(),
          resolved_by_user_id: userId ? new ObjectId(userId) : null
        }
      }
    )
    
    // Получаем информацию о пользователе из сессии для socket event
    const sessionUser = req.session?.passport?.user
    let user = null
    if (userId && sessionUser) {
      user = {
        id: userId.toString(),
        email: sessionUser.email,
        first_name: sessionUser.first_name,
      }
    }
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'resolve-thread', threadId, user)
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, threadId }, 'error resolving thread')
    res.status(500).json({ error: 'Failed to resolve thread' })
  }
}

async function reopenThread(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  
  try {
    await db.projectHistoryComments.updateOne(
      { _id: new ObjectId(threadId) },
      { 
        $set: { resolved: false },
        $unset: { resolved_at: '', resolved_by_user_id: '' }
      }
    )
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'reopen-thread', threadId)
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, threadId }, 'error reopening thread')
    res.status(500).json({ error: 'Failed to reopen thread' })
  }
}

async function editMessage(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  const messageId = req.params.message_id
  const { content } = req.body
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' })
  }
  
  try {
    await db.projectHistoryComments.updateOne(
      { 
        _id: new ObjectId(threadId),
        'messages.id': messageId
      },
      { 
        $set: { 
          'messages.$.content': content,
          'messages.$.edited': true,
          'messages.$.edited_at': new Date()
        }
      }
    )
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'edit-message', threadId, messageId, content)
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, threadId, messageId }, 'error editing message')
    res.status(500).json({ error: 'Failed to edit message' })
  }
}

async function deleteMessage(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  const messageId = req.params.message_id
  
  try {
    await db.projectHistoryComments.updateOne(
      { _id: new ObjectId(threadId) },
      { $pull: { messages: { id: messageId } } }
    )
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(projectId, 'delete-message', threadId, messageId)
    
    res.sendStatus(204)
  } catch (error) {
    logger.error({ err: error, threadId, messageId }, 'error deleting message')
    res.status(500).json({ error: 'Failed to delete message' })
  }
}

async function getCommentsWithPositions(req, res) {
  const projectId = req.params.Project_id
  
  try {
    // Получаем псевдонимы из проекта
    const project = await ProjectGetter.promises.getProject(projectId, {
      memberAliases: 1,
    })
    const memberAliases = project?.memberAliases || {}
    
    // Получаем пути к документам проекта
    const docPaths = await ProjectEntityHandler.promises.getAllDocPathsFromProjectById(projectId)

    // Сбрасываем несохранённые правки из document-updater в docstore,
    // иначе ranges могут быть устаревшими
    await DocumentUpdaterHandler.promises.flushProjectToMongo(projectId)

    // Получаем ranges (позиции комментариев) из docstore
    const docRanges = await DocstoreManager.promises.getAllRanges(projectId)
    
    // Получаем threads (сообщения комментариев) из MongoDB
    const threads = await db.projectHistoryComments
      .find({ project_id: new ObjectId(projectId) })
      .toArray()
    
    // Создаем map thread_id -> thread data
    const threadsMap = new Map()
    for (const thread of threads) {
      threadsMap.set(thread._id.toString(), thread)
    }
    
    // Собираем все комментарии с позициями
    const comments = []
    
    for (const docRange of docRanges) {
      // docstore отдаёт _id, а не id (см. docstore HttpController._buildDocsArrayView)
      const docId = docRange.id ?? docRange._id
      const docPath = docPaths[docId] || 'unknown'
      
      for (const comment of docRange.ranges?.comments || []) {
        const threadId = comment.op?.t || comment.id?.toString()
        const thread = threadsMap.get(threadId)
        
        if (!thread) {
          // Комментарий без thread (возможно удален)
          continue
        }
        
        // Получаем информацию о пользователях для каждого сообщения
        const messages = []
        for (const message of thread.messages || []) {
          let user = null
          if (message.user_id) {
            try {
              const userId = message.user_id.toString()
              user = await UserGetter.promises.getUser(userId, {
                email: 1,
                first_name: 1,
                last_name: 1,
              })
              // Добавляем псевдоним если он есть
              if (user && memberAliases[userId]) {
                user.alias = memberAliases[userId]
              }
            } catch (err) {
              logger.warn({ err, userId: message.user_id }, 'error getting user for comment message')
            }
          }
          
          const author = user ? {
            id: message.user_id.toString(),
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            alias: user.alias,
          } : null
          
          messages.push({
            author,
            text: message.content,
            timestamp: message.timestamp,
          })
        }
        
        // Позиция комментария в документе
        const position = comment.op?.p || 0
        const commentText = comment.op?.c || ''
        
        comments.push({
          thread_id: threadId,
          file: docPath,
          position: {
            start: position,
            end: position + commentText.length,
          },
          text: commentText,
          messages,
          resolved: thread.resolved || false,
        })
      }
    }
    
    res.json({ comments })
  } catch (error) {
    logger.error({ err: error, projectId }, 'error getting comments with positions')
    res.status(500).json({ error: 'Failed to get comments with positions' })
  }
}

export default {
  getChangesUsers,
  getThreads,
  createMessage,
  deleteThread,
  resolveThread,
  reopenThread,
  editMessage,
  deleteMessage,
  getCommentsWithPositions,
}

