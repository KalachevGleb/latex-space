import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/User/UserInviteController.mjs'

describe('UserInviteController', function () {
  beforeEach(async function (ctx) {
    ctx.email = 'invitee@example.com'
    ctx.newUser = { _id: 'new-user-id', email: ctx.email }

    ctx.UserRegistrationHandler = {
      promises: {
        registerNewUserAndSendActivationEmail: sinon.stub().resolves({
          user: ctx.newUser,
          setNewPasswordUrl: 'https://overleaf.test/set-password?token=abc',
        }),
      },
    }
    ctx.UserGetter = {
      promises: { getUserByAnyEmail: sinon.stub().resolves(null) },
    }
    ctx.UserModel = {
      updateOne: sinon.stub().returns({ exec: sinon.stub().resolves() }),
    }
    ctx.EmailHelper = { parseEmail: sinon.stub().callsFake(e => e) }

    vi.doMock(
      '../../../../app/src/Features/User/UserRegistrationHandler.js',
      () => ({ default: ctx.UserRegistrationHandler })
    )
    vi.doMock('../../../../app/src/Features/User/UserGetter.js', () => ({
      default: ctx.UserGetter,
    }))
    vi.doMock('../../../../app/src/models/User.js', () => ({
      User: ctx.UserModel,
    }))
    vi.doMock('../../../../app/src/Features/Helpers/EmailHelper.js', () => ({
      default: ctx.EmailHelper,
    }))

    ctx.UserInviteController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.req.isServiceAuth = true
    ctx.req.body = { email: ctx.email }
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  it('should reject requests that are not service-authenticated', async function (ctx) {
    ctx.req.isServiceAuth = false

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(403)
    expect(JSON.parse(ctx.res.body).error).to.equal('forbidden')
    expect(
      ctx.UserRegistrationHandler.promises
        .registerNewUserAndSendActivationEmail
    ).to.not.have.been.called
  })

  it('should reject when no email is provided', async function (ctx) {
    ctx.req.body = {}

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(400)
    expect(JSON.parse(ctx.res.body).error).to.equal('missing_email')
  })

  it('should reject when the email is not a string', async function (ctx) {
    ctx.req.body = { email: { not: 'a string' } }

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(400)
    expect(JSON.parse(ctx.res.body).error).to.equal('missing_email')
  })

  it('should reject when the email is malformed', async function (ctx) {
    ctx.EmailHelper.parseEmail.returns(null)
    ctx.req.body = { email: 'not-an-email' }

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(400)
    expect(JSON.parse(ctx.res.body).error).to.equal('invalid_email')
  })

  it('should return 409 when a real user already exists', async function (ctx) {
    ctx.UserGetter.promises.getUserByAnyEmail.resolves({
      _id: 'existing',
      holdingAccount: false,
    })

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(409)
    expect(JSON.parse(ctx.res.body).error).to.equal('email_already_registered')
    expect(
      ctx.UserRegistrationHandler.promises
        .registerNewUserAndSendActivationEmail
    ).to.not.have.been.called
  })

  it('should proceed when only a holding account exists', async function (ctx) {
    ctx.UserGetter.promises.getUserByAnyEmail.resolves({
      _id: 'holding',
      holdingAccount: true,
    })

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(201)
    expect(
      ctx.UserRegistrationHandler.promises
        .registerNewUserAndSendActivationEmail
    ).to.have.been.called
  })

  it('should register the user, mark them invited, and return the activation link', async function (ctx) {
    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(
      ctx.UserRegistrationHandler.promises
        .registerNewUserAndSendActivationEmail
    ).to.have.been.calledWith(ctx.email)
    expect(ctx.UserModel.updateOne).to.have.been.calledWith(
      { _id: ctx.newUser._id },
      { $set: { invitedToRegister: true } }
    )
    expect(ctx.res.statusCode).to.equal(201)
    expect(JSON.parse(ctx.res.body)).to.deep.equal({
      status: 'created',
      email: ctx.email,
      setNewPasswordUrl: 'https://overleaf.test/set-password?token=abc',
    })
  })

  it('should forward unexpected errors to next', async function (ctx) {
    const error = new Error('registration failed')
    ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail.rejects(
      error
    )

    await ctx.UserInviteController.inviteUser(ctx.req, ctx.res, ctx.next)

    expect(ctx.next).to.have.been.calledWith(error)
  })
})
