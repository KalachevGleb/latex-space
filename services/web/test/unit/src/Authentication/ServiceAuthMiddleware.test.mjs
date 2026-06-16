import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/Authentication/ServiceAuthMiddleware.mjs'

// A syntactically valid 60-char bcrypt hash for the "already hashed" path
const BCRYPT_HASH = '$2b$12$' + 'a'.repeat(53)

describe('ServiceAuthMiddleware', function () {
  beforeEach(async function (ctx) {
    ctx.Settings = {
      serviceApi: {
        enabled: true,
        password: BCRYPT_HASH,
        localhostOnly: false,
      },
      security: { bcryptRounds: 10 },
    }

    ctx.UserGetter = {
      promises: {
        getUser: sinon.stub().resolves({ _id: 'looked-up-id' }),
        getUserByAnyEmail: sinon.stub().resolves({ _id: 'looked-up-id' }),
      },
    }

    ctx.basicAuth = sinon.stub().returns({ name: 'overleaf', pass: 'secret' })

    ctx.bcrypt = {
      compare: sinon.stub().resolves(true),
      hash: sinon.stub().resolves(BCRYPT_HASH),
    }

    ctx.SystemSettingsManager = {
      promises: { setSetting: sinon.stub().resolves() },
    }

    ctx.store = {}
    ctx.AsyncLocalStorage = {
      storage: { getStore: sinon.stub().returns(ctx.store) },
    }

    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('../../../../app/src/Features/User/UserGetter.js', () => ({
      default: ctx.UserGetter,
    }))
    vi.doMock('basic-auth', () => ({ default: ctx.basicAuth }))
    vi.doMock('bcrypt', () => ({ default: ctx.bcrypt }))
    vi.doMock(
      '../../../../app/src/Features/SystemSettings/SystemSettingsManager.mjs',
      () => ({ default: ctx.SystemSettingsManager })
    )
    vi.doMock(
      '../../../../app/src/infrastructure/AsyncLocalStorage.js',
      () => ({ default: ctx.AsyncLocalStorage })
    )

    ctx.ServiceAuthMiddleware = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.req.get = sinon.stub().returns(undefined)
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  describe('requireServiceAuth', function () {
    it('should reject with 403 when the Service API is disabled', async function (ctx) {
      ctx.Settings.serviceApi.enabled = false

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(403)
      expect(JSON.parse(ctx.res.body).error).to.equal('service_api_disabled')
      expect(ctx.next).to.not.have.been.called
    })

    it('should reject with 403 when no password is configured', async function (ctx) {
      ctx.Settings.serviceApi.password = null

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(403)
      expect(JSON.parse(ctx.res.body).error).to.equal(
        'service_api_not_configured'
      )
    })

    it('should reject non-localhost requests when localhostOnly is set', async function (ctx) {
      ctx.Settings.serviceApi.localhostOnly = true
      ctx.req.ip = '203.0.113.5'

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(403)
      expect(JSON.parse(ctx.res.body).error).to.equal('access_denied')
    })

    it('should allow localhost requests when localhostOnly is set', async function (ctx) {
      ctx.Settings.serviceApi.localhostOnly = true
      ctx.req.ip = '127.0.0.1'

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.req.isServiceAuth).to.equal(true)
    })

    it('should reject with 401 when credentials are missing', async function (ctx) {
      ctx.basicAuth.returns(undefined)

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(401)
      expect(ctx.res.headers['WWW-Authenticate']).to.exist
      expect(JSON.parse(ctx.res.body).error).to.equal('unauthorized')
    })

    it('should reject with 401 when the username is not "overleaf"', async function (ctx) {
      ctx.basicAuth.returns({ name: 'someoneelse', pass: 'secret' })

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(401)
    })

    it('should reject with 401 when the password does not match', async function (ctx) {
      ctx.bcrypt.compare.resolves(false)

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(401)
      expect(JSON.parse(ctx.res.body).error_description).to.equal(
        'Invalid credentials'
      )
      expect(ctx.next).to.not.have.been.called
    })

    it('should authenticate valid credentials and mark the request', async function (ctx) {
      ctx.req.get.withArgs('x-overleaf-user-id').returns('user-123')

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.bcrypt.compare).to.have.been.calledWith('secret', BCRYPT_HASH)
      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.next.firstCall.args[0]).to.equal(undefined)
      expect(ctx.req.isServiceAuth).to.equal(true)
      expect(ctx.store.isServiceAuth).to.equal(true)
      expect(ctx.req.serviceUser).to.deep.equal({
        userId: 'user-123',
        userEmail: undefined,
      })
    })

    it('should migrate a plain-text password to a bcrypt hash before comparing', async function (ctx) {
      ctx.Settings.serviceApi.password = 'plain-text-password'

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.bcrypt.hash).to.have.been.calledWith('plain-text-password', 10)
      expect(
        ctx.SystemSettingsManager.promises.setSetting
      ).to.have.been.calledWith('serviceApiPassword', BCRYPT_HASH)
      expect(ctx.Settings.serviceApi.password).to.equal(BCRYPT_HASH)
      expect(ctx.next).to.have.been.calledOnce
    })

    it('should not re-hash a password that is already a bcrypt hash', async function (ctx) {
      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.bcrypt.hash).to.not.have.been.called
      expect(ctx.SystemSettingsManager.promises.setSetting).to.not.have.been
        .called
    })

    it('should pass bcrypt errors to next', async function (ctx) {
      const error = new Error('bcrypt boom')
      ctx.bcrypt.compare.rejects(error)

      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })

    it('should not set serviceUser when no user headers are present', async function (ctx) {
      await ctx.ServiceAuthMiddleware.requireServiceAuth(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.req.serviceUser).to.equal(undefined)
      expect(ctx.next).to.have.been.calledOnce
    })
  })

  describe('attachSessionUser', function () {
    it('should skip when the request is not service-authenticated', async function (ctx) {
      ctx.req.isServiceAuth = false

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.UserGetter.promises.getUser).to.not.have.been.called
    })

    it('should skip when there is no service user to look up', async function (ctx) {
      ctx.req.isServiceAuth = true
      ctx.req.serviceUser = undefined

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.UserGetter.promises.getUser).to.not.have.been.called
    })

    it('should look up the user by id and attach it to the request', async function (ctx) {
      const user = { _id: 'user-123', email: 'u@example.com' }
      ctx.UserGetter.promises.getUser.resolves(user)
      ctx.req.isServiceAuth = true
      ctx.req.serviceUser = { userId: 'user-123' }

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.UserGetter.promises.getUser).to.have.been.calledWith('user-123')
      expect(ctx.req.user).to.equal(user)
      expect(ctx.req.session.user).to.equal(user)
      expect(ctx.next).to.have.been.calledOnce
    })

    it('should look up the user by email when no id is given', async function (ctx) {
      const user = { _id: 'user-123', email: 'u@example.com' }
      ctx.UserGetter.promises.getUserByAnyEmail.resolves(user)
      ctx.req.isServiceAuth = true
      ctx.req.serviceUser = { userEmail: 'u@example.com' }

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.UserGetter.promises.getUserByAnyEmail
      ).to.have.been.calledWith('u@example.com')
      expect(ctx.req.user).to.equal(user)
    })

    it('should respond 401 when the service user is not found', async function (ctx) {
      ctx.UserGetter.promises.getUser.resolves(null)
      ctx.req.isServiceAuth = true
      ctx.req.serviceUser = { userId: 'missing' }

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.res.statusCode).to.equal(401)
      expect(JSON.parse(ctx.res.body).error).to.equal('invalid_user')
      expect(ctx.next).to.not.have.been.called
    })

    it('should forward lookup errors to next', async function (ctx) {
      const error = new Error('db error')
      ctx.UserGetter.promises.getUser.rejects(error)
      ctx.req.isServiceAuth = true
      ctx.req.serviceUser = { userId: 'user-123' }

      await ctx.ServiceAuthMiddleware.attachSessionUser(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })
  })
})
