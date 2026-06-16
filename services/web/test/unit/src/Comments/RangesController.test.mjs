import { vi, expect } from 'vitest'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const { ObjectId } = mongodb

const MODULE_PATH =
  '../../../../app/src/Features/Comments/RangesController.mjs'

describe('RangesController', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = new ObjectId().toString()
    ctx.resolvedThreadId = new ObjectId()
    ctx.openThreadId = new ObjectId()

    ctx.collection = { find: sinon.stub() }
    ctx.db = { projectHistoryComments: ctx.collection }

    ctx.DocstoreManager = {
      promises: { getAllRanges: sinon.stub().resolves([]) },
    }

    vi.doMock('../../../../app/src/infrastructure/mongodb.js', () => ({
      db: ctx.db,
      ObjectId,
    }))
    vi.doMock('../../../../app/src/Features/Docstore/DocstoreManager.js', () => ({
      default: ctx.DocstoreManager,
    }))

    ctx.RangesController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.req.params = { Project_id: ctx.projectId }
    ctx.res = new MockResponse()
  })

  it('returns ranges for ALL documents, enriched with the resolved state', async function (ctx) {
    // two docs, each with a comment; one thread resolved, one not
    ctx.DocstoreManager.promises.getAllRanges.resolves([
      {
        id: 'doc-1',
        ranges: {
          comments: [{ id: 'c1', op: { p: 0, t: ctx.openThreadId.toString() } }],
          changes: [{ id: 'ch1' }],
        },
      },
      {
        id: 'doc-2',
        ranges: {
          comments: [
            { id: 'c2', op: { p: 5, t: ctx.resolvedThreadId.toString() } },
          ],
        },
      },
    ])
    ctx.collection.find.returns({
      toArray: sinon.stub().resolves([
        { _id: ctx.openThreadId, resolved: false },
        { _id: ctx.resolvedThreadId, resolved: true },
      ]),
    })

    await ctx.RangesController.getAllRanges(ctx.req, ctx.res)

    const result = JSON.parse(ctx.res.body)
    expect(result.map(d => d.id)).to.deep.equal(['doc-1', 'doc-2'])
    expect(result[0].ranges.comments[0].resolved).to.equal(false)
    expect(result[0].ranges.changes).to.have.length(1)
    expect(result[1].ranges.comments[0].resolved).to.equal(true)
  })

  it('defaults resolved to false for a comment with no matching thread', async function (ctx) {
    ctx.DocstoreManager.promises.getAllRanges.resolves([
      {
        id: 'doc-1',
        ranges: { comments: [{ id: 'c1', op: { p: 0, t: 'orphan-thread' } }] },
      },
    ])
    ctx.collection.find.returns({ toArray: sinon.stub().resolves([]) })

    await ctx.RangesController.getAllRanges(ctx.req, ctx.res)

    const result = JSON.parse(ctx.res.body)
    expect(result[0].ranges.comments[0].resolved).to.equal(false)
  })

  it('returns empty changes/comments arrays when a doc has no ranges', async function (ctx) {
    ctx.DocstoreManager.promises.getAllRanges.resolves([{ id: 'doc-1' }])
    ctx.collection.find.returns({ toArray: sinon.stub().resolves([]) })

    await ctx.RangesController.getAllRanges(ctx.req, ctx.res)

    const result = JSON.parse(ctx.res.body)
    expect(result[0].ranges.comments).to.deep.equal([])
    expect(result[0].ranges.changes).to.deep.equal([])
  })

  it('responds 500 when fetching ranges fails', async function (ctx) {
    ctx.DocstoreManager.promises.getAllRanges.rejects(new Error('docstore down'))

    await ctx.RangesController.getAllRanges(ctx.req, ctx.res)

    expect(ctx.res.statusCode).to.equal(500)
  })
})
