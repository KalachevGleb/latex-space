import { vi } from 'vitest'
import Path from 'node:path'
import sinon from 'sinon'

const MODULE_PATH = '../../../app/src/UserActivateController.mjs'

const VIEW_PATH = Path.join(
  import.meta.dirname,
  '../../../app/views/user/activate'
)

describe('UserActivateController', function () {
  beforeEach(async function (ctx) {
    ctx.user = {
      _id: (ctx.user_id = 'kwjewkl'),
      features: {},
      email: 'joe@example.com',
    }

    ctx.UserGetter = {
      promises: {
        getUser: sinon.stub(),
        getUserByAnyEmail: sinon.stub(),
      },
    }
    ctx.UserRegistrationHandler = { promises: {} }
    ctx.SystemSettingsManager = {
      promises: {
        getSetting: sinon.stub(),
      },
    }
    ctx.User = { updateOne: sinon.stub().returns({ exec: sinon.stub() }) }
    ctx.ErrorController = { notFound: sinon.stub() }
    ctx.SplitTestHandler = {
      promises: {
        getAssignment: sinon.stub().resolves({ variant: 'default' }),
      },
    }

    vi.doMock('../../../../../app/src/Features/User/UserGetter.js', () => ({
      default: ctx.UserGetter,
    }))

    vi.doMock(
      '../../../../../app/src/Features/User/UserRegistrationHandler.js',
      () => ({
        default: ctx.UserRegistrationHandler,
      })
    )
    vi.doMock(
      '../../../../../app/src/Features/SystemSettings/SystemSettingsManager.mjs',
      () => ({
        default: ctx.SystemSettingsManager,
      })
    )
    vi.doMock('../../../../../app/src/models/User.js', () => ({
      User: ctx.User,
    }))

    vi.doMock(
      '../../../../../app/src/Features/Errors/ErrorController.mjs',
      () => ({
        default: ctx.ErrorController,
      })
    )

    vi.doMock(
      '../../../../../app/src/Features/SplitTests/SplitTestHandler',
      () => ({
        default: ctx.SplitTestHandler,
      })
    )

    ctx.UserActivateController = (await import(MODULE_PATH)).default
    ctx.req = {
      body: {},
      query: {},
      session: {
        user: ctx.user,
      },
    }
    ctx.res = {
      json: sinon.stub(),
    }
  })

  describe('activateAccountPage', function () {
    beforeEach(function (ctx) {
      ctx.UserGetter.promises.getUser = sinon.stub().resolves(ctx.user)
      ctx.req.query.user_id = ctx.user_id
      ctx.req.query.token = ctx.token = 'mock-token-123'
    })

    it('should 404 without a user_id', async function (ctx) {
      delete ctx.req.query.user_id

      await new Promise(resolve => {
        ctx.ErrorController.notFound = () => resolve()
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })

    it('should 404 without a token', async function (ctx) {
      await new Promise(resolve => {
        delete ctx.req.query.token
        ctx.ErrorController.notFound = resolve
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })

    it('should 404 without a valid user_id', async function (ctx) {
      await new Promise(resolve => {
        ctx.UserGetter.promises.getUser = sinon.stub().resolves(null)
        ctx.ErrorController.notFound = resolve
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })

    it('should 403 for complex user_id', async function (ctx) {
      await new Promise(resolve => {
        ctx.ErrorController.forbidden = resolve
        ctx.req.query.user_id = { first_name: 'X' }
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })

    it('should redirect activated users to login', async function (ctx) {
      await new Promise(resolve => {
        ctx.user.loginCount = 1
        ctx.res.redirect = url => {
          sinon.assert.calledWith(ctx.UserGetter.promises.getUser, ctx.user_id)
          url.should.equal('/login')
          resolve()
        }
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })

    it('render the activation page if the user has not logged in before', async function (ctx) {
      await new Promise(resolve => {
        ctx.user.loginCount = 0
        ctx.res.render = (page, opts) => {
          page.should.equal(VIEW_PATH)
          opts.email.should.equal(ctx.user.email)
          opts.token.should.equal(ctx.token)
          resolve()
        }
        ctx.UserActivateController.activateAccountPage(ctx.req, ctx.res)
      })
    })
  })

  describe('register', function () {
    beforeEach(function (ctx) {
      ctx.url = 'mock/url'
      ctx.email = 'email@example.com'
      ctx.user.email = ctx.email
      ctx.req.body.email = ctx.email
      ctx.res.status = sinon.stub().returns(ctx.res)
      ctx.res.sendStatus = sinon.stub()
      ctx.User.updateOne = sinon.stub().returns({ exec: sinon.stub().resolves() })
      ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail =
        sinon.stub().resolves({
          user: ctx.user,
          setNewPasswordUrl: ctx.url,
        })
    })

    it('should send activation email for admin register flow', async function (ctx) {
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(null)

      await ctx.UserActivateController.register(ctx.req, ctx.res)

      sinon.assert.calledWith(
        ctx.UserRegistrationHandler.promises
          .registerNewUserAndSendActivationEmail,
        ctx.email
      )
      ctx.res.json
        .calledWithMatch({
          email: ctx.email,
          setNewPasswordUrl: ctx.url,
        })
        .should.equal(true)
      sinon.assert.calledWith(ctx.User.updateOne, { _id: ctx.user._id }, {
        $set: { invitedToRegister: true },
      })
    })

    it('should reject already-activated user on admin register', async function (ctx) {
      ctx.UserGetter.promises.getUserByAnyEmail.resolves({
        _id: 'u1',
        loginCount: 1,
      })

      await ctx.UserActivateController.register(ctx.req, ctx.res)

      sinon.assert.notCalled(
        ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail
      )
      sinon.assert.calledWith(ctx.res.status, 409)
    })
  })

  describe('signup', function () {
    beforeEach(function (ctx) {
      ctx.url = 'mock/url'
      ctx.email = 'email@example.com'
      ctx.user.email = ctx.email
      ctx.req.body.email = ctx.email
      ctx.res.status = sinon.stub().returns(ctx.res)
      ctx.res.sendStatus = sinon.stub()
      ctx.User.updateOne = sinon.stub().returns({ exec: sinon.stub().resolves() })
      ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail =
        sinon.stub().resolves({
          user: ctx.user,
          setNewPasswordUrl: ctx.url,
        })
    })

    it('should reject unknown email when open registration is disabled', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.resolves(false)
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(null)

      await ctx.UserActivateController.signup(ctx.req, ctx.res)

      sinon.assert.notCalled(
        ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail
      )
      sinon.assert.calledWith(ctx.res.status, 403)
    })

    it('should allow invited email when open registration is disabled', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.resolves(false)
      ctx.UserGetter.promises.getUserByAnyEmail.resolves({
        _id: 'invited-user-id',
        loginCount: 0,
        invitedToRegister: true,
        holdingAccount: false,
      })

      await ctx.UserActivateController.signup(ctx.req, ctx.res)

      sinon.assert.calledWith(
        ctx.UserRegistrationHandler.promises
          .registerNewUserAndSendActivationEmail,
        ctx.email
      )
    })

    it('should reject non-invited pending user when open registration is disabled', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.resolves(false)
      ctx.UserGetter.promises.getUserByAnyEmail.resolves({
        _id: 'u1',
        loginCount: 0,
        invitedToRegister: false,
        holdingAccount: false,
      })

      await ctx.UserActivateController.signup(ctx.req, ctx.res)

      sinon.assert.notCalled(
        ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail
      )
      sinon.assert.calledWith(ctx.res.status, 403)
    })

    it('should allow new email when open registration is enabled', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.resolves(true)
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(null)

      await ctx.UserActivateController.signup(ctx.req, ctx.res)

      sinon.assert.calledWith(
        ctx.UserRegistrationHandler.promises
          .registerNewUserAndSendActivationEmail,
        ctx.email
      )
    })

    it('should reject activated user when open registration is enabled', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.resolves(true)
      ctx.UserGetter.promises.getUserByAnyEmail.resolves({
        _id: 'u1',
        loginCount: 1,
      })

      await ctx.UserActivateController.signup(ctx.req, ctx.res)

      sinon.assert.notCalled(
        ctx.UserRegistrationHandler.promises.registerNewUserAndSendActivationEmail
      )
      sinon.assert.calledWith(ctx.res.status, 409)
    })
  })
})
