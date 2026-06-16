import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/SystemSettings/SystemSettingsMiddleware.mjs'

describe('SystemSettingsMiddleware', function () {
  beforeEach(async function (ctx) {
    ctx.SystemSettingsManager = {
      promises: {
        getSetting: sinon.stub().resolves(true),
      },
    }
    ctx.SessionManager = {
      getSessionUser: sinon.stub().returns({ _id: 'user-id' }),
    }
    ctx.hasAdminAccess = sinon.stub().returns(false)

    vi.doMock(
      '../../../../app/src/Features/SystemSettings/SystemSettingsManager.mjs',
      () => ({ default: ctx.SystemSettingsManager })
    )
    vi.doMock(
      '../../../../app/src/Features/Helpers/AdminAuthorizationHelper.js',
      () => ({ hasAdminAccess: ctx.hasAdminAccess })
    )
    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager.js',
      () => ({ default: ctx.SessionManager })
    )

    ctx.SystemSettingsMiddleware = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  describe('ensureRegistrationEnabled', function () {
    it('should allow admins through even when registration is disabled', async function (ctx) {
      ctx.hasAdminAccess.returns(true)
      ctx.SystemSettingsManager.promises.getSetting.resolves(false)

      await ctx.SystemSettingsMiddleware.ensureRegistrationEnabled(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.res.statusCode).to.not.equal(403)
    })

    it('should allow non-admins through when registration is enabled', async function (ctx) {
      ctx.hasAdminAccess.returns(false)
      ctx.SystemSettingsManager.promises.getSetting.resolves(true)

      await ctx.SystemSettingsMiddleware.ensureRegistrationEnabled(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
    })

    it('should block non-admins with 403 when registration is disabled', async function (ctx) {
      ctx.hasAdminAccess.returns(false)
      ctx.SystemSettingsManager.promises.getSetting.resolves(false)

      await ctx.SystemSettingsMiddleware.ensureRegistrationEnabled(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.not.have.been.called
      expect(ctx.res.statusCode).to.equal(403)
      expect(ctx.res.body).to.contain('Registration Disabled')
    })

    it('should fail open (call next) when reading the setting throws', async function (ctx) {
      ctx.SystemSettingsManager.promises.getSetting.rejects(
        new Error('db down')
      )

      await ctx.SystemSettingsMiddleware.ensureRegistrationEnabled(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.next.firstCall.args[0]).to.equal(undefined)
    })
  })
})
