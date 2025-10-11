import logger from '@overleaf/logger'
import { db, ObjectId } from '../../infrastructure/mongodb.js'
import UserGetter from '../User/UserGetter.js'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import ProjectGetter from '../Project/ProjectGetter.js'

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
  // Passport.js хранит пользователя в req.session.passport.user
  const userId = req.session?.passport?.user?._id || req.session?.user?._id
  
  logger.info({ projectId, threadId, userId, hasSession: !!req.session, hasPassport: !!req.session?.passport }, 'createMessage called')
  
  if (!content) {
    return res.status(400).json({ error: 'Content is required' })
  }
  
  try {
    // Получаем псевдонимы из проекта
    const project = await ProjectGetter.promises.getProject(projectId, {
      memberAliases: 1,
    })
    const memberAliases = project?.memberAliases || {}
    
    const messageId = new ObjectId()
    const timestamp = new Date()
    
    // Получаем информацию о пользователе из сессии
    const sessionUser = req.session?.passport?.user
    let user = null
    if (userId && sessionUser) {
      user = {
        email: sessionUser.email,
        first_name: sessionUser.first_name,
        last_name: sessionUser.last_name,
      }
      // Добавляем псевдоним если он есть
      if (memberAliases[userId]) {
        user.alias = memberAliases[userId]
      }
      logger.info({ userId, userName: `${user.first_name} ${user.last_name}` }, 'user from session')
    } else {
      logger.warn({ userId, hasSession: !!req.session, hasPassport: !!req.session?.passport }, 'no user data available')
    }
    
    const message = {
      id: messageId.toString(),
      content,
      timestamp,
      user_id: userId ? new ObjectId(userId) : null,
    }
    
    // Проверяем, существует ли thread
    const existingThread = await db.projectHistoryComments.findOne({
      _id: new ObjectId(threadId),
    })
    
    if (existingThread) {
      // Добавляем сообщение в существующий thread
      await db.projectHistoryComments.updateOne(
        { _id: new ObjectId(threadId) },
        { 
          $push: { messages: message },
          $set: { updated_at: timestamp }
        }
      )
    } else {
      // Создаем новый thread
      await db.projectHistoryComments.insertOne({
        _id: new ObjectId(threadId),
        project_id: new ObjectId(projectId),
        messages: [message],
        resolved: false,
        created_at: timestamp,
        updated_at: timestamp,
      })
    }
    
    // Возвращаем сообщение с информацией о пользователе для frontend
    const responseMessage = {
      id: messageId.toString(),
      content,
      timestamp,
      user: user ? {
        id: userId.toString(),
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        alias: user.alias,
      } : null,
    }
    
    // Отправляем socket event для real-time обновления
    EditorRealTimeController.emitToRoom(
      projectId,
      'new-comment',
      threadId,
      responseMessage
    )
    
    res.json(responseMessage)
  } catch (error) {
    logger.error({ err: error, projectId, threadId }, 'error creating message')
    res.status(500).json({ error: 'Failed to create message' })
  }
}

async function deleteThread(req, res) {
  const projectId = req.params.Project_id
  const threadId = req.params.thread_id
  
  try {
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
  const userId = req.session?.passport?.user?._id || req.session?.user?._id
  
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

export default {
  getChangesUsers,
  getThreads,
  createMessage,
  deleteThread,
  resolveThread,
  reopenThread,
  editMessage,
  deleteMessage,
}

