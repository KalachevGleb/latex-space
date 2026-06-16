import { vi, expect } from 'vitest'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const { ObjectId } = mongodb

const MODULE_PATH =
  '../../../../app/src/Features/Comments/CommentsController.mjs'

describe('CommentsController', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = new ObjectId().toString()
    ctx.threadId = new ObjectId()
    ctx.userOid = new ObjectId()
    ctx.userId = ctx.userOid.toString()

    ctx.collection = {
      find: sinon.stub(),
      findOne: sinon.stub(),
      updateOne: sinon.stub().resolves(),
      insertOne: sinon.stub().resolves(),
      deleteOne: sinon.stub().resolves(),
    }
    ctx.db = { projectHistoryComments: ctx.collection }

    ctx.UserGetter = {
      promises: {
        getUser: sinon.stub().resolves({
          email: 'author@example.com',
          first_name: 'Ada',
          last_name: 'Lovelace',
        }),
      },
    }
    ctx.EditorRealTimeController = { emitToRoom: sinon.stub() }
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon
          .stub()
          .resolves({ memberAliases: { [ctx.userId]: 'Reviewer 1' } }),
      },
    }
    ctx.ProjectEntityHandler = {
      promises: { getAllDocPathsFromProjectById: sinon.stub().resolves({}) },
    }
    ctx.DocstoreManager = {
      promises: { getAllRanges: sinon.stub().resolves([]) },
    }

    vi.doMock('../../../../app/src/infrastructure/mongodb.js', () => ({
      db: ctx.db,
      ObjectId,
    }))
    vi.doMock('../../../../app/src/Features/User/UserGetter.js', () => ({
      default: ctx.UserGetter,
    }))
    vi.doMock(
      '../../../../app/src/Features/Editor/EditorRealTimeController.js',
      () => ({ default: ctx.EditorRealTimeController })
    )
    vi.doMock('../../../../app/src/Features/Project/ProjectGetter.js', () => ({
      default: ctx.ProjectGetter,
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler.js',
      () => ({ default: ctx.ProjectEntityHandler })
    )
    vi.doMock(
      '../../../../app/src/Features/Docstore/DocstoreManager.js',
      () => ({ default: ctx.DocstoreManager })
    )

    ctx.CommentsController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.req.params = { Project_id: ctx.projectId }
    ctx.res = new MockResponse()
  })

  function findReturns(threads) {
    return { toArray: sinon.stub().resolves(threads) }
  }

  describe('getChangesUsers', function () {
    it('should return unique users with aliases applied', async function (ctx) {
      const otherOid = new ObjectId()
      ctx.collection.find.returns(
        findReturns([
          {
            messages: [
              { user_id: ctx.userOid },
              { user_id: ctx.userOid }, // duplicate
              { user_id: otherOid },
            ],
          },
        ])
      )
      ctx.UserGetter.promises.getUser
        .withArgs(ctx.userId, sinon.match.any)
        .resolves({
          email: 'a@example.com',
          first_name: 'Ada',
          last_name: 'L',
        })
      ctx.UserGetter.promises.getUser
        .withArgs(otherOid.toString(), sinon.match.any)
        .resolves({
          email: 'b@example.com',
          first_name: 'Bob',
          last_name: 'M',
        })

      await ctx.CommentsController.getChangesUsers(ctx.req, ctx.res)

      const users = JSON.parse(ctx.res.body)
      expect(users).to.have.length(2)
      const ada = users.find(u => u.id === ctx.userId)
      expect(ada.alias).to.equal('Reviewer 1')
      const bob = users.find(u => u.id === otherOid.toString())
      expect(bob.alias).to.equal(undefined)
    })

    it('should respond 500 when fetching the project fails', async function (ctx) {
      ctx.ProjectGetter.promises.getProject.rejects(new Error('boom'))

      await ctx.CommentsController.getChangesUsers(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(500)
    })
  })

  describe('getThreads', function () {
    it('should return threads keyed by id with resolved state', async function (ctx) {
      ctx.collection.find.returns(
        findReturns([
          {
            _id: ctx.threadId,
            resolved: true,
            messages: [
              {
                id: 'm1',
                content: 'hello',
                timestamp: 123,
                user_id: ctx.userOid,
              },
            ],
          },
        ])
      )

      await ctx.CommentsController.getThreads(ctx.req, ctx.res)

      const threads = JSON.parse(ctx.res.body)
      const thread = threads[ctx.threadId.toString()]
      expect(thread.resolved).to.equal(true)
      expect(thread.messages[0].content).to.equal('hello')
      expect(thread.messages[0].user.alias).to.equal('Reviewer 1')
    })
  })

  describe('createMessage', function () {
    beforeEach(function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, thread_id: ctx.threadId.toString() }
      ctx.req.body = { content: 'a new comment' }
      ctx.req.session = {
        passport: {
          user: {
            _id: ctx.userId,
            email: 'author@example.com',
            first_name: 'Ada',
            last_name: 'Lovelace',
          },
        },
      }
    })

    it('should return 400 when content is missing', async function (ctx) {
      ctx.req.body = {}

      await ctx.CommentsController.createMessage(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(400)
      expect(ctx.collection.insertOne).to.not.have.been.called
      expect(ctx.collection.updateOne).to.not.have.been.called
    })

    it('should push to an existing thread and broadcast', async function (ctx) {
      ctx.collection.findOne.resolves({ _id: ctx.threadId })

      await ctx.CommentsController.createMessage(ctx.req, ctx.res)

      expect(ctx.collection.updateOne).to.have.been.called
      expect(ctx.collection.insertOne).to.not.have.been.called
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'new-comment',
        ctx.threadId.toString()
      )
      const body = JSON.parse(ctx.res.body)
      expect(body.content).to.equal('a new comment')
      expect(body.user.alias).to.equal('Reviewer 1')
    })

    it('should create a new thread when one does not exist', async function (ctx) {
      ctx.collection.findOne.resolves(null)

      await ctx.CommentsController.createMessage(ctx.req, ctx.res)

      expect(ctx.collection.insertOne).to.have.been.called
      expect(ctx.collection.updateOne).to.not.have.been.called
    })
  })

  describe('deleteThread', function () {
    it('should delete the thread and broadcast', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, thread_id: ctx.threadId.toString() }

      await ctx.CommentsController.deleteThread(ctx.req, ctx.res)

      expect(ctx.collection.deleteOne).to.have.been.called
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'delete-thread',
        ctx.threadId.toString()
      )
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('should respond 500 when deletion fails', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, thread_id: ctx.threadId.toString() }
      ctx.collection.deleteOne.rejects(new Error('boom'))

      await ctx.CommentsController.deleteThread(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(500)
    })
  })

  describe('resolveThread', function () {
    it('should set the thread resolved and broadcast', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, thread_id: ctx.threadId.toString() }
      ctx.req.session = {
        passport: { user: { _id: ctx.userId, email: 'a@example.com', first_name: 'Ada' } },
      }

      await ctx.CommentsController.resolveThread(ctx.req, ctx.res)

      const [, event, threadId] =
        ctx.EditorRealTimeController.emitToRoom.firstCall.args
      expect(event).to.equal('resolve-thread')
      expect(threadId).to.equal(ctx.threadId.toString())
      expect(ctx.collection.updateOne).to.have.been.called
      expect(ctx.res.statusCode).to.equal(204)
    })
  })

  describe('reopenThread', function () {
    it('should clear the resolved state and broadcast', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, thread_id: ctx.threadId.toString() }

      await ctx.CommentsController.reopenThread(ctx.req, ctx.res)

      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'reopen-thread',
        ctx.threadId.toString()
      )
      expect(ctx.res.statusCode).to.equal(204)
    })
  })

  describe('editMessage', function () {
    beforeEach(function (ctx) {
      ctx.req.params = {
        Project_id: ctx.projectId,
        thread_id: ctx.threadId.toString(),
        message_id: 'm1',
      }
    })

    it('should return 400 when content is missing', async function (ctx) {
      ctx.req.body = {}

      await ctx.CommentsController.editMessage(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(400)
      expect(ctx.collection.updateOne).to.not.have.been.called
    })

    it('should update the message and broadcast', async function (ctx) {
      ctx.req.body = { content: 'edited' }

      await ctx.CommentsController.editMessage(ctx.req, ctx.res)

      expect(ctx.collection.updateOne).to.have.been.called
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'edit-message',
        ctx.threadId.toString(),
        'm1',
        'edited'
      )
      expect(ctx.res.statusCode).to.equal(204)
    })
  })

  describe('deleteMessage', function () {
    it('should pull the message and broadcast', async function (ctx) {
      ctx.req.params = {
        Project_id: ctx.projectId,
        thread_id: ctx.threadId.toString(),
        message_id: 'm1',
      }

      await ctx.CommentsController.deleteMessage(ctx.req, ctx.res)

      expect(ctx.collection.updateOne).to.have.been.called
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'delete-message',
        ctx.threadId.toString(),
        'm1'
      )
      expect(ctx.res.statusCode).to.equal(204)
    })
  })

  describe('getCommentsWithPositions', function () {
    it('should join ranges, doc paths and threads into positioned comments', async function (ctx) {
      const docId = 'doc-1'
      ctx.ProjectEntityHandler.promises.getAllDocPathsFromProjectById.resolves({
        [docId]: '/main.tex',
      })
      ctx.DocstoreManager.promises.getAllRanges.resolves([
        {
          id: docId,
          ranges: {
            comments: [
              {
                op: { t: ctx.threadId.toString(), p: 10, c: 'hello' },
              },
            ],
          },
        },
      ])
      ctx.collection.find.returns(
        findReturns([
          {
            _id: ctx.threadId,
            resolved: false,
            messages: [
              {
                content: 'a reply',
                timestamp: 5,
                user_id: ctx.userOid,
              },
            ],
          },
        ])
      )

      await ctx.CommentsController.getCommentsWithPositions(ctx.req, ctx.res)

      const { comments } = JSON.parse(ctx.res.body)
      expect(comments).to.have.length(1)
      const comment = comments[0]
      expect(comment.thread_id).to.equal(ctx.threadId.toString())
      expect(comment.file).to.equal('/main.tex')
      expect(comment.position).to.deep.equal({ start: 10, end: 15 })
      expect(comment.text).to.equal('hello')
      expect(comment.messages[0].text).to.equal('a reply')
      expect(comment.messages[0].author.alias).to.equal('Reviewer 1')
    })

    it('should skip comments whose thread no longer exists', async function (ctx) {
      const docId = 'doc-1'
      ctx.ProjectEntityHandler.promises.getAllDocPathsFromProjectById.resolves({
        [docId]: '/main.tex',
      })
      ctx.DocstoreManager.promises.getAllRanges.resolves([
        {
          id: docId,
          ranges: {
            comments: [{ op: { t: new ObjectId().toString(), p: 0, c: 'x' } }],
          },
        },
      ])
      ctx.collection.find.returns(findReturns([])) // no threads

      await ctx.CommentsController.getCommentsWithPositions(ctx.req, ctx.res)

      const { comments } = JSON.parse(ctx.res.body)
      expect(comments).to.have.length(0)
    })

    it('should respond 500 when docstore lookup fails', async function (ctx) {
      ctx.DocstoreManager.promises.getAllRanges.rejects(new Error('boom'))

      await ctx.CommentsController.getCommentsWithPositions(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(500)
    })
  })
})
