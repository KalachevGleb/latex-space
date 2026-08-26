import { expect, vi } from 'vitest'
import sinon from 'sinon'
import { RequestFailedError } from '@overleaf/fetch-utils'

const MODULE_PATH =
  '../../../../app/src/Features/Comments/ReviewApiController.mjs'

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: sinon.stub().callsFake(code => {
      res.statusCode = code
      return res
    }),
    json: sinon.stub().callsFake(body => {
      res.body = body
      return res
    }),
  }
  return res
}

describe('ReviewApiController', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = '6a8f5121a48c86a4e999ade0'
    ctx.docId = '6a8f5121a48c86a4e999ade4'
    ctx.userId = '6a8f5121a48c86a4e999addc'
    ctx.docLines = [
      'This paper studys the behaviour of automata.',
      'We show that that the bound is tight.',
    ]
    ctx.docText = ctx.docLines.join('\n')

    ctx.DocumentUpdaterHandler = {
      promises: {
        getDocument: sinon.stub().resolves({ lines: ctx.docLines, version: 7 }),
        applyOps: sinon.stub().resolves({ version: 8 }),
      },
    }
    ctx.CommentsController = {
      addMessage: sinon
        .stub()
        .callsFake(async (projectId, threadId, userId, content) => ({
          id: 'message-id',
          content,
          user: { id: userId },
        })),
      deleteThreadById: sinon.stub().resolves(),
    }
    ctx.CollaboratorsGetter = {
      promises: {
        getMemberIdsWithPrivilegeLevels: sinon.stub().resolves([
          { id: 'owner-id', privilegeLevel: 'owner' },
          { id: ctx.userId, privilegeLevel: 'review' },
        ]),
      },
    }
    ctx.EditorRealTimeController = { emitToRoom: sinon.stub() }
    ctx.Project = { updateOne: sinon.stub().resolves() }

    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler.js',
      () => ({ default: ctx.DocumentUpdaterHandler })
    )
    vi.doMock(
      '../../../../app/src/Features/Comments/CommentsController.mjs',
      () => ({
        default: {},
        addMessage: ctx.CommentsController.addMessage,
        deleteThreadById: ctx.CommentsController.deleteThreadById,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Collaborators/CollaboratorsGetter.js',
      () => ({ default: ctx.CollaboratorsGetter })
    )
    vi.doMock(
      '../../../../app/src/Features/Editor/EditorRealTimeController.js',
      () => ({ default: ctx.EditorRealTimeController })
    )
    vi.doMock('../../../../app/src/models/Project.js', () => ({
      Project: ctx.Project,
    }))

    ctx.controller = (await import(MODULE_PATH)).default
    ctx.next = sinon.stub()
    ctx.res = makeRes()
    ctx.makeReq = body => ({
      params: { Project_id: ctx.projectId, doc_id: ctx.docId },
      session: { user: { _id: ctx.userId } },
      body,
    })
  })

  describe('addComment', function () {
    it('creates a thread message and a comment range', async function (ctx) {
      const pos = ctx.docText.indexOf('automata')
      await ctx.controller.addComment(
        ctx.makeReq({ pos, text: 'automata', content: 'Which kind?' }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(201)
      const threadId = ctx.res.body.thread_id
      expect(threadId).to.match(/^[0-9a-f]{24}$/)
      expect(ctx.CommentsController.addMessage).to.have.been.calledWith(
        ctx.projectId,
        threadId,
        ctx.userId,
        'Which kind?'
      )
      expect(
        ctx.DocumentUpdaterHandler.promises.applyOps
      ).to.have.been.calledWith(
        ctx.projectId,
        ctx.docId,
        ctx.userId,
        [{ c: 'automata', p: pos, t: threadId }],
        { version: 7 }
      )
      expect(ctx.res.body.position).to.deep.equal({
        start: pos,
        end: pos + 'automata'.length,
      })
      expect(ctx.Project.updateOne).not.to.have.been.called
    })

    it('sets the author alias when requested', async function (ctx) {
      await ctx.controller.addComment(
        ctx.makeReq({
          pos: 0,
          text: 'This',
          content: 'x',
          author_alias: '  ИИ рецензия ',
        }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(201)
      expect(ctx.Project.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $set: { [`memberAliases.${ctx.userId}`]: 'ИИ рецензия' } }
      )
      expect(ctx.EditorRealTimeController.emitToRoom).to.have.been.calledWith(
        ctx.projectId,
        'project:membership:changed',
        { members: true }
      )
    })

    it('returns 409 when the anchor text does not match', async function (ctx) {
      await ctx.controller.addComment(
        ctx.makeReq({ pos: 0, text: 'Nope', content: 'x' }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(409)
      expect(ctx.res.body.error).to.equal('text_mismatch')
      expect(ctx.res.body.actual).to.equal('This')
      expect(ctx.CommentsController.addMessage).not.to.have.been.called
    })

    it('returns 400 for invalid input', async function (ctx) {
      for (const body of [
        { pos: -1, text: 'This', content: 'x' },
        { pos: 0, text: '', content: 'x' },
        { pos: 0, text: 'This', content: '   ' },
        { pos: 0, text: 'This', content: 'x', author_alias: 42 },
      ]) {
        const res = makeRes()
        await ctx.controller.addComment(ctx.makeReq(body), res, ctx.next)
        expect(res.statusCode, JSON.stringify(body)).to.equal(400)
      }
    })

    it('removes the thread and returns 409 when the ops are rejected', async function (ctx) {
      // fetch-utils passes the response body through as text
      ctx.DocumentUpdaterHandler.promises.applyOps.rejects(
        new RequestFailedError(
          'url',
          {},
          { status: 409 },
          JSON.stringify({ error_description: 'Op too old' })
        )
      )
      await ctx.controller.addComment(
        ctx.makeReq({ pos: 0, text: 'This', content: 'x' }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(409)
      expect(ctx.res.body.error).to.equal('ops_rejected')
      expect(ctx.res.body.error_description).to.equal('Op too old')
      expect(ctx.CommentsController.deleteThreadById).to.have.been.calledOnce
    })
  })

  describe('addSuggestions', function () {
    it('applies word-level tracked replacements and attaches comments', async function (ctx) {
      const items = [
        {
          pos: ctx.docText.indexOf('that that'),
          old_text: 'that that',
          new_text: 'that',
          comment: 'Duplicate word',
        },
        {
          pos: ctx.docText.indexOf('studys'),
          old_text: 'studys',
          new_text: 'studies',
        },
      ]
      await ctx.controller.addSuggestions(
        ctx.makeReq({ items }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(200)
      expect(ctx.res.body.applied).to.equal(2)
      expect(ctx.res.body.comments).to.have.length(1)
      expect(ctx.res.body.comments[0].index).to.equal(0)

      const applyOps = ctx.DocumentUpdaterHandler.promises.applyOps
      expect(applyOps).to.have.been.calledTwice

      // edits: items are processed in document order, offsets shifted
      const [, , , editOps, editOpts] = applyOps.firstCall.args
      const studysPos = ctx.docText.indexOf('studys')
      const thatPos = ctx.docText.indexOf('that that')
      expect(editOps).to.deep.equal([
        { d: 'studys', p: studysPos },
        { i: 'studies', p: studysPos },
        // word diff keeps the first "that" and drops " that"; the position is
        // shifted by +1 because "studies" is one character longer
        { d: ' that', p: thatPos + 1 + 'that'.length },
      ])
      expect(editOpts).to.deep.equal({ version: 7, trackChanges: true })

      // comment on the replaced text at its final position
      const [, , , commentOps, commentOpts] = applyOps.secondCall.args
      const threadId = ctx.res.body.comments[0].thread_id
      expect(commentOps).to.deep.equal([
        { c: 'that', p: thatPos + 1, t: threadId },
      ])
      expect(commentOpts).to.deep.equal({ version: 8 })
      expect(ctx.CommentsController.addMessage).to.have.been.calledWith(
        ctx.projectId,
        threadId,
        ctx.userId,
        'Duplicate word'
      )
    })

    it('anchors a comment on a pure deletion to the next character', async function (ctx) {
      const pos = ctx.docText.indexOf(' the behaviour')
      await ctx.controller.addSuggestions(
        ctx.makeReq({
          items: [
            { pos, old_text: ' the behaviour', new_text: '', comment: 'Drop' },
          ],
        }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(200)
      const [, , , commentOps] =
        ctx.DocumentUpdaterHandler.promises.applyOps.secondCall.args
      expect(commentOps[0].c).to.equal(' ')
      expect(commentOps[0].p).to.equal(pos)
    })

    it('returns 409 when an anchor does not match', async function (ctx) {
      await ctx.controller.addSuggestions(
        ctx.makeReq({
          items: [{ pos: 0, old_text: 'Nope', new_text: 'x' }],
        }),
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(409)
      expect(ctx.res.body.error).to.equal('text_mismatch')
      expect(ctx.res.body.index).to.equal(0)
      expect(ctx.DocumentUpdaterHandler.promises.applyOps).not.to.have.been
        .called
    })

    it('returns 400 for overlapping or invalid items', async function (ctx) {
      for (const items of [
        [],
        [{ pos: 0, old_text: 'This', new_text: 'This' }],
        [
          { pos: 0, old_text: 'This paper', new_text: 'x' },
          { pos: 5, old_text: 'paper', new_text: 'y' },
        ],
        [{ pos: 0, old_text: 'This', new_text: 'x', comment: 5 }],
      ]) {
        const res = makeRes()
        await ctx.controller.addSuggestions(
          ctx.makeReq({ items }),
          res,
          ctx.next
        )
        expect(res.statusCode, JSON.stringify(items)).to.equal(400)
      }
      expect(ctx.DocumentUpdaterHandler.promises.applyOps).not.to.have.been
        .called
    })
  })

  describe('setMemberAlias', function () {
    it('sets the alias of a member', async function (ctx) {
      await ctx.controller.setMemberAlias(
        {
          params: { Project_id: ctx.projectId, user_id: ctx.userId },
          body: { alias: 'ИИ корректура' },
        },
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(200)
      expect(ctx.Project.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $set: { [`memberAliases.${ctx.userId}`]: 'ИИ корректура' } }
      )
    })

    it('clears the alias with null', async function (ctx) {
      await ctx.controller.setMemberAlias(
        {
          params: { Project_id: ctx.projectId, user_id: ctx.userId },
          body: { alias: null },
        },
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(200)
      expect(ctx.Project.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $unset: { [`memberAliases.${ctx.userId}`]: '' } }
      )
    })

    it('returns 404 for a non-member', async function (ctx) {
      await ctx.controller.setMemberAlias(
        {
          params: { Project_id: ctx.projectId, user_id: 'stranger' },
          body: { alias: 'x' },
        },
        ctx.res,
        ctx.next
      )
      expect(ctx.res.statusCode).to.equal(404)
      expect(ctx.Project.updateOne).not.to.have.been.called
    })
  })
})
