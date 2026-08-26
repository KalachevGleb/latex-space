// Service API endpoints for adding comments and tracked-change suggestions to
// a document on behalf of the acting user (e.g. an AI review bot).
//
// Authorship reuses the regular user model: the acting user is the one given
// in X-Overleaf-User-Id, and the displayed name can be overridden per project
// with the existing memberAliases field.
import { expressify } from '@overleaf/promise-utils'
import logger from '@overleaf/logger'
import { diffWordsWithSpace } from 'diff'
import RangesTracker from '@overleaf/ranges-tracker'
import DocumentUpdaterHandler from '../DocumentUpdater/DocumentUpdaterHandler.js'
import SessionManager from '../Authentication/SessionManager.js'
import CollaboratorsGetter from '../Collaborators/CollaboratorsGetter.js'
import EditorRealTimeController from '../Editor/EditorRealTimeController.js'
import { Project } from '../../models/Project.js'
import { addMessage, deleteThreadById } from './CommentsController.mjs'

const MAX_ALIAS_LENGTH = 100
const MAX_SUGGESTIONS_PER_REQUEST = 500

class ValidationError extends Error {
  constructor(code, description, extra = {}) {
    super(description)
    this.code = code
    this.extra = extra
  }
}

function badRequest(res, code, description, extra = {}) {
  return res.status(400).json({
    error: code,
    error_description: description,
    ...extra,
  })
}

function normalizeAlias(alias) {
  if (alias === undefined) {
    return undefined
  }
  if (alias === null || alias === '') {
    return null
  }
  if (typeof alias !== 'string') {
    throw new ValidationError('invalid_alias', 'alias must be a string')
  }
  const trimmed = alias.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.length > MAX_ALIAS_LENGTH) {
    throw new ValidationError(
      'invalid_alias',
      `alias must be at most ${MAX_ALIAS_LENGTH} characters`
    )
  }
  return trimmed
}

async function updateMemberAlias(projectId, userId, alias) {
  const key = `memberAliases.${userId}`
  if (alias) {
    await Project.updateOne({ _id: projectId }, { $set: { [key]: alias } })
  } else {
    await Project.updateOne({ _id: projectId }, { $unset: { [key]: '' } })
  }
  // Editors reload the member list (and hence aliases) on this event
  EditorRealTimeController.emitToRoom(projectId, 'project:membership:changed', {
    members: true,
  })
}

async function loadDocText(projectId, docId) {
  const doc = await DocumentUpdaterHandler.promises.getDocument(
    projectId,
    docId,
    -1
  )
  return { text: doc.lines.join('\n'), version: doc.version }
}

function parseErrorBody(body) {
  if (typeof body !== 'string') {
    return body
  }
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * Translate an error from the document updater into an HTTP response.
 * Returns true when the error was handled.
 */
function handleDocUpdaterError(err, res, context) {
  // Check by name rather than instanceof: the error class may come from a
  // different module instance (e.g. under test)
  if (err?.name === 'RequestFailedError') {
    const status = err.response?.status
    if (status === 404) {
      res.status(404).json({
        error: 'not_found',
        error_description: 'Document not found',
      })
      return true
    }
    if (status === 409) {
      const body = parseErrorBody(err.body)
      logger.debug({ ...context, body }, 'ops rejected')
      res.status(409).json({
        error: 'ops_rejected',
        error_description:
          body?.error_description ||
          'The document changed and the ops could not be applied',
      })
      return true
    }
  }
  return false
}

/**
 * Anchor a comment to a range of a document.
 *
 * POST /api/project/:Project_id/doc/:doc_id/comments
 * Body: { pos, text, content, author_alias? }
 */
async function addComment(req, res) {
  const { Project_id: projectId, doc_id: docId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { pos, text, content, author_alias: rawAlias } = req.body

  if (!Number.isInteger(pos) || pos < 0) {
    return badRequest(res, 'invalid_pos', 'pos must be a non-negative integer')
  }
  if (typeof text !== 'string' || text.length === 0) {
    return badRequest(res, 'invalid_text', 'text must be a non-empty string')
  }
  if (typeof content !== 'string' || content.trim().length === 0) {
    return badRequest(
      res,
      'invalid_content',
      'content must be a non-empty string'
    )
  }
  let alias
  try {
    alias = normalizeAlias(rawAlias)
  } catch (err) {
    if (err instanceof ValidationError) {
      return badRequest(res, err.code, err.message)
    }
    throw err
  }

  const { text: docText, version } = await loadDocText(projectId, docId)
  const actual = docText.slice(pos, pos + text.length)
  if (actual !== text) {
    return res.status(409).json({
      error: 'text_mismatch',
      error_description: 'The document text at pos does not match text',
      expected: text,
      actual,
    })
  }

  if (alias !== undefined) {
    await updateMemberAlias(projectId, userId, alias)
  }

  const threadId = RangesTracker.generateId()
  const message = await addMessage(projectId, threadId, userId, content)

  try {
    await DocumentUpdaterHandler.promises.applyOps(
      projectId,
      docId,
      userId,
      [{ c: text, p: pos, t: threadId }],
      { version }
    )
  } catch (err) {
    // Do not leave a thread without a range behind
    await deleteThreadById(projectId, threadId).catch(cleanupErr =>
      logger.warn(
        { err: cleanupErr, projectId, threadId },
        'failed to remove thread after ops error'
      )
    )
    if (handleDocUpdaterError(err, res, { projectId, docId, threadId })) {
      return
    }
    throw err
  }

  logger.info({ projectId, docId, userId, threadId }, 'comment added via API')

  res.status(201).json({
    thread_id: threadId,
    doc_id: docId,
    position: { start: pos, end: pos + text.length },
    text,
    message,
  })
}

/**
 * Build ShareJS ops replacing oldText with newText at basePos, as a word-level
 * diff so that tracked changes stay readable. Returns the ops and the length
 * delta of the replacement.
 */
function buildReplaceOps(basePos, oldText, newText) {
  const ops = []
  let cursor = basePos
  for (const part of diffWordsWithSpace(oldText, newText)) {
    if (part.removed) {
      ops.push({ d: part.value, p: cursor })
      // deleted text is gone from the new document: do not advance
    } else if (part.added) {
      ops.push({ i: part.value, p: cursor })
      cursor += part.value.length
    } else {
      cursor += part.value.length
    }
  }
  return ops
}

function validateSuggestionItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError(
      'invalid_items',
      'items must be a non-empty array'
    )
  }
  if (items.length > MAX_SUGGESTIONS_PER_REQUEST) {
    throw new ValidationError(
      'too_many_items',
      `at most ${MAX_SUGGESTIONS_PER_REQUEST} items per request`
    )
  }
  return items.map((item, index) => {
    const { pos, old_text: oldText, new_text: newText, comment } = item || {}
    if (!Number.isInteger(pos) || pos < 0) {
      throw new ValidationError(
        'invalid_pos',
        `items[${index}].pos must be a non-negative integer`,
        { index }
      )
    }
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new ValidationError(
        'invalid_text',
        `items[${index}].old_text and new_text must be strings`,
        { index }
      )
    }
    if (oldText === newText) {
      throw new ValidationError(
        'no_change',
        `items[${index}]: old_text and new_text are identical`,
        { index }
      )
    }
    if (comment != null && typeof comment !== 'string') {
      throw new ValidationError(
        'invalid_comment',
        `items[${index}].comment must be a string`,
        { index }
      )
    }
    return {
      index,
      pos,
      oldText,
      newText,
      comment: comment && comment.trim().length > 0 ? comment : null,
    }
  })
}

/**
 * Apply one or more replacements as tracked changes, each optionally with a
 * comment attached to the replaced text.
 *
 * POST /api/project/:Project_id/doc/:doc_id/suggestions
 * Body: { items: [{ pos, old_text, new_text, comment? }], author_alias? }
 */
async function addSuggestions(req, res) {
  const { Project_id: projectId, doc_id: docId } = req.params
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { items: rawItems, author_alias: rawAlias } = req.body

  let items, alias
  try {
    items = validateSuggestionItems(rawItems)
    alias = normalizeAlias(rawAlias)
  } catch (err) {
    if (err instanceof ValidationError) {
      return badRequest(res, err.code, err.message, err.extra)
    }
    throw err
  }

  // Process in document order so that offsets can be shifted incrementally
  items.sort((a, b) => a.pos - b.pos)

  const { text: docText, version } = await loadDocText(projectId, docId)

  // Verify anchors and overlaps against the document the caller has seen
  let previousEnd = -1
  for (const item of items) {
    if (item.pos < previousEnd) {
      return badRequest(
        res,
        'overlapping_items',
        `items[${item.index}] overlaps the previous item`,
        { index: item.index }
      )
    }
    const actual = docText.slice(item.pos, item.pos + item.oldText.length)
    if (actual !== item.oldText) {
      return res.status(409).json({
        error: 'text_mismatch',
        error_description: `The document text at items[${item.index}].pos does not match old_text`,
        index: item.index,
        expected: item.oldText,
        actual,
      })
    }
    previousEnd = item.pos + item.oldText.length
  }

  // Build the tracked-change ops and remember where each replacement ends up
  const editOps = []
  const commentRanges = []
  let shift = 0
  for (const item of items) {
    const newPos = item.pos + shift
    editOps.push(...buildReplaceOps(newPos, item.oldText, item.newText))
    shift += item.newText.length - item.oldText.length
    if (item.comment) {
      commentRanges.push({ item, pos: newPos, length: item.newText.length })
    }
  }

  if (alias !== undefined) {
    await updateMemberAlias(projectId, userId, alias)
  }

  let result
  try {
    result = await DocumentUpdaterHandler.promises.applyOps(
      projectId,
      docId,
      userId,
      editOps,
      { version, trackChanges: true }
    )
  } catch (err) {
    if (handleDocUpdaterError(err, res, { projectId, docId })) {
      return
    }
    throw err
  }

  // Attach comments to the new text. The edits are applied already, so the
  // comment ops target the updated document. For a pure deletion there is no
  // new text: the comment goes on the character right after (or before) it.
  const newDocText = applyReplacements(docText, items)
  const comments = []
  const commentOps = []
  for (const { item, pos, length } of commentRanges) {
    let range = { pos, length }
    if (length === 0) {
      if (pos < newDocText.length) {
        range = { pos, length: 1 }
      } else if (pos > 0) {
        range = { pos: pos - 1, length: 1 }
      } else {
        continue // empty document, nothing to anchor to
      }
    }
    const threadId = RangesTracker.generateId()
    await addMessage(projectId, threadId, userId, item.comment)
    commentOps.push({
      c: newDocText.slice(range.pos, range.pos + range.length),
      p: range.pos,
      t: threadId,
    })
    comments.push({ index: item.index, thread_id: threadId })
  }

  if (commentOps.length > 0) {
    try {
      result = await DocumentUpdaterHandler.promises.applyOps(
        projectId,
        docId,
        userId,
        commentOps,
        { version: result?.version }
      )
    } catch (err) {
      for (const { thread_id: threadId } of comments) {
        await deleteThreadById(projectId, threadId).catch(() => {})
      }
      if (handleDocUpdaterError(err, res, { projectId, docId })) {
        return
      }
      throw err
    }
  }

  logger.info(
    {
      projectId,
      docId,
      userId,
      items: items.length,
      comments: comments.length,
    },
    'suggestions added via API'
  )

  res.json({
    version: result?.version,
    applied: items.length,
    comments,
  })
}

function applyReplacements(docText, sortedItems) {
  let out = ''
  let cursor = 0
  for (const item of sortedItems) {
    out += docText.slice(cursor, item.pos) + item.newText
    cursor = item.pos + item.oldText.length
  }
  return out + docText.slice(cursor)
}

/**
 * Set or clear the display name of a project member.
 *
 * PUT /api/project/:Project_id/users/:user_id/alias
 * Body: { alias } — empty or null removes the alias
 */
async function setMemberAlias(req, res) {
  const { Project_id: projectId, user_id: userId } = req.params

  let alias
  try {
    alias = normalizeAlias(req.body?.alias)
  } catch (err) {
    if (err instanceof ValidationError) {
      return badRequest(res, err.code, err.message)
    }
    throw err
  }
  if (alias === undefined) {
    return badRequest(res, 'missing_alias', 'alias is required (null to clear)')
  }

  const members =
    await CollaboratorsGetter.promises.getMemberIdsWithPrivilegeLevels(
      projectId
    )
  if (!members.some(member => member.id.toString() === userId)) {
    return res.status(404).json({
      error: 'not_a_member',
      error_description: 'User is not a member of this project',
    })
  }

  await updateMemberAlias(projectId, userId, alias)
  logger.info({ projectId, userId, alias }, 'member alias updated via API')

  res.json({ user_id: userId, alias })
}

export default {
  addComment: expressify(addComment),
  addSuggestions: expressify(addSuggestions),
  setMemberAlias: expressify(setMemberAlias),
}
