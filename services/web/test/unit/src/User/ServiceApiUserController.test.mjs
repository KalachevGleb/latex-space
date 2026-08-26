import { expect, vi } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/User/ServiceApiUserController.mjs'

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

describe('ServiceApiUserController', function () {
  beforeEach(async function (ctx) {
    ctx.userId = '6a8f5121a48c86a4e999addc'
    ctx.UserCreator = {
      promises: {
        createNewUser: sinon.stub().callsFake(async attributes => ({
          _id: ctx.userId,
          ...attributes,
        })),
      },
    }
    ctx.UserGetter = {
      promises: { getUserByAnyEmail: sinon.stub().resolves(null) },
    }
    vi.doMock('../../../../app/src/Features/User/UserCreator.js', () => ({
      default: ctx.UserCreator,
    }))
    vi.doMock('../../../../app/src/Features/User/UserGetter.js', () => ({
      default: ctx.UserGetter,
    }))
    ctx.controller = (await import(MODULE_PATH)).default
    ctx.res = makeRes()
    ctx.next = sinon.stub()
  })

  it('creates a confirmed user without sending e-mail', async function (ctx) {
    await ctx.controller.createUser(
      {
        isServiceAuth: true,
        body: { email: 'TestBot@ai.local', first_name: ' TestBot ' },
      },
      ctx.res,
      ctx.next
    )
    expect(ctx.res.statusCode).to.equal(201)
    expect(ctx.res.body.user_id).to.equal(ctx.userId)
    expect(ctx.UserCreator.promises.createNewUser).to.have.been.calledOnce
    const [attributes, options] =
      ctx.UserCreator.promises.createNewUser.firstCall.args
    expect(attributes).to.deep.equal({
      email: 'testbot@ai.local',
      first_name: 'TestBot',
      last_name: '',
    })
    expect(options.confirmedAt).to.be.instanceOf(Date)
  })

  it('requires service auth', async function (ctx) {
    await ctx.controller.createUser(
      { isServiceAuth: false, body: { email: 'a@b.co' } },
      ctx.res,
      ctx.next
    )
    expect(ctx.res.statusCode).to.equal(403)
    expect(ctx.UserCreator.promises.createNewUser).not.to.have.been.called
  })

  it('rejects missing or invalid e-mails', async function (ctx) {
    for (const body of [{}, { email: 'nope' }, { email: 42 }]) {
      const res = makeRes()
      await ctx.controller.createUser(
        { isServiceAuth: true, body },
        res,
        ctx.next
      )
      expect(res.statusCode, JSON.stringify(body)).to.equal(400)
    }
  })

  it('returns 409 with the existing user id', async function (ctx) {
    ctx.UserGetter.promises.getUserByAnyEmail.resolves({ _id: 'existing' })
    await ctx.controller.createUser(
      { isServiceAuth: true, body: { email: 'a@b.co' } },
      ctx.res,
      ctx.next
    )
    expect(ctx.res.statusCode).to.equal(409)
    expect(ctx.res.body.user_id).to.equal('existing')
    expect(ctx.UserCreator.promises.createNewUser).not.to.have.been.called
  })
})
