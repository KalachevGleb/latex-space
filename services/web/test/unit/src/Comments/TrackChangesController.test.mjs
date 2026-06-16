import { vi, expect } from 'vitest'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const { ObjectId } = mongodb

const MODULE_PATH =
  '../../../../app/src/Features/Comments/TrackChangesController.mjs'

describe('TrackChangesController', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = new ObjectId().toString()
    ctx.docId = new ObjectId().toString()
    ctx.userId = new ObjectId().toString()

    ctx.projects = { updateOne: sinon.stub().resolves() }
    ctx.db = { projects: ctx.projects }

    ctx.EditorRealTimeController = { emitToRoom: sinon.stub() }
    ctx.DocumentUpdaterHandler = {
      promises: { acceptChanges: sinon.stub().resolves() },
    }

    vi.doMock('../../../../app/src/infrastructure/mongodb.js', () => ({
      db: ctx.db,
      ObjectId,
    }))
    vi.doMock(
      '../../../../app/src/Features/Editor/EditorRealTimeController.js',
      () => ({ default: ctx.EditorRealTimeController })
    )
    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.js',
      () => ({ default: ctx.DocumentUpdaterHandler })
    )

    ctx.TrackChangesController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.res = new MockResponse()
  })

  describe('setTrackChangesState', function () {
    beforeEach(function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
    })

    it('enables track changes for everyone via "on"', async function (ctx) {
      ctx.req.body = { on: true }

      await ctx.TrackChangesController.setTrackChangesState(ctx.req, ctx.res)

      expect(ctx.projects.updateOne).to.have.been.calledWithMatch(sinon.match.any, {
        $set: { track_changes: true },
      })
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'toggle-track-changes',
        true
      )
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('enables track changes per-user via "on_for"', async function (ctx) {
      const onFor = { [ctx.userId]: true }
      ctx.req.body = { on_for: onFor }

      await ctx.TrackChangesController.setTrackChangesState(ctx.req, ctx.res)

      expect(ctx.projects.updateOne).to.have.been.calledWithMatch(sinon.match.any, {
        $set: { track_changes: onFor },
      })
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('responds 400 when neither "on" nor "on_for" is provided', async function (ctx) {
      ctx.req.body = {}

      await ctx.TrackChangesController.setTrackChangesState(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(400)
      expect(ctx.projects.updateOne).to.not.have.been.called
    })

    it('responds 500 when the database update fails', async function (ctx) {
      ctx.req.body = { on: true }
      ctx.projects.updateOne.rejects(new Error('db down'))

      await ctx.TrackChangesController.setTrackChangesState(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(500)
    })
  })

  describe('acceptChanges', function () {
    beforeEach(function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, doc_id: ctx.docId }
      ctx.req.session = { passport: { user: { _id: ctx.userId } } }
    })

    it('accepts the given changes and broadcasts the event', async function (ctx) {
      ctx.req.body = { change_ids: ['change-1', 'change-2'] }

      await ctx.TrackChangesController.acceptChanges(ctx.req, ctx.res)

      expect(
        ctx.DocumentUpdaterHandler.promises.acceptChanges
      ).to.have.been.calledWith(
        ctx.projectId,
        ctx.docId,
        ['change-1', 'change-2'],
        ctx.userId
      )
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'accept-changes',
        ctx.docId,
        ['change-1', 'change-2']
      )
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('responds 400 when change_ids is missing or not an array', async function (ctx) {
      ctx.req.body = {}

      await ctx.TrackChangesController.acceptChanges(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(400)
      expect(ctx.DocumentUpdaterHandler.promises.acceptChanges).to.not.have.been
        .called
    })

    it('responds 500 when accepting changes fails', async function (ctx) {
      ctx.req.body = { change_ids: ['change-1'] }
      ctx.DocumentUpdaterHandler.promises.acceptChanges.rejects(
        new Error('doc-updater down')
      )

      await ctx.TrackChangesController.acceptChanges(ctx.req, ctx.res)

      expect(ctx.res.statusCode).to.equal(500)
    })
  })
})
