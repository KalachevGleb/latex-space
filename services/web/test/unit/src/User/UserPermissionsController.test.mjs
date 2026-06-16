import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/User/UserPermissionsController.mjs'

describe('UserPermissionsController', function () {
  beforeEach(async function (ctx) {
    ctx.userId = '5be316a9c7f6aa03802ea8fb'

    ctx.UserPermissionsHandler = {
      promises: {
        setUserPermissions: sinon.stub().resolves(),
        getUserPermissions: sinon.stub().resolves('full'),
      },
    }

    vi.doMock(
      '../../../../app/src/Features/User/UserPermissionsHandler.mjs',
      () => ({
        default: ctx.UserPermissionsHandler,
      })
    )

    ctx.UserPermissionsController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  describe('setUserPermissions', function () {
    it('should delegate to the handler and return 204', async function (ctx) {
      ctx.req.params = { user_id: ctx.userId }
      ctx.req.body = { permissions: 'basic' }

      await ctx.UserPermissionsController.setUserPermissions(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.UserPermissionsHandler.promises.setUserPermissions
      ).to.have.been.calledWith(ctx.userId, 'basic')
      expect(ctx.res.statusCode).to.equal(204)
      expect(ctx.next).to.not.have.been.called
    })

    it('should reject an invalid permissions value via validation', async function (ctx) {
      ctx.req.params = { user_id: ctx.userId }
      ctx.req.body = { permissions: 'root' }

      await ctx.UserPermissionsController.setUserPermissions(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.next.firstCall.args[0]).to.be.an('error')
      expect(
        ctx.UserPermissionsHandler.promises.setUserPermissions
      ).to.not.have.been.called
    })
  })

  describe('getUserPermissions', function () {
    it('should return the permissions as JSON', async function (ctx) {
      ctx.req.params = { user_id: ctx.userId }
      ctx.UserPermissionsHandler.promises.getUserPermissions.resolves('basic')

      await ctx.UserPermissionsController.getUserPermissions(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.UserPermissionsHandler.promises.getUserPermissions
      ).to.have.been.calledWith(ctx.userId)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({ permissions: 'basic' })
    })

    it('should forward handler errors to next', async function (ctx) {
      ctx.req.params = { user_id: ctx.userId }
      const error = new Error('User not found')
      ctx.UserPermissionsHandler.promises.getUserPermissions.rejects(error)

      await ctx.UserPermissionsController.getUserPermissions(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })
  })
})
