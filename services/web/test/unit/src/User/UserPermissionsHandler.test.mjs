import { vi, expect } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/User/UserPermissionsHandler.mjs'

describe('UserPermissionsHandler', function () {
  beforeEach(async function (ctx) {
    ctx.userId = '5be316a9c7f6aa03802ea8fb'
    ctx.UserModel = {}

    vi.doMock('../../../../app/src/models/User.js', () => ({
      User: ctx.UserModel,
    }))

    ctx.UserPermissionsHandler = (await import(MODULE_PATH)).default
  })

  describe('setUserPermissions', function () {
    beforeEach(function (ctx) {
      ctx.UserModel.updateOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves() })
    })

    it('should persist "full" permissions', async function (ctx) {
      await ctx.UserPermissionsHandler.promises.setUserPermissions(
        ctx.userId,
        'full'
      )
      expect(ctx.UserModel.updateOne).to.have.been.calledWith(
        { _id: ctx.userId },
        { $set: { permissions: 'full' } }
      )
    })

    it('should persist "basic" permissions', async function (ctx) {
      await ctx.UserPermissionsHandler.promises.setUserPermissions(
        ctx.userId,
        'basic'
      )
      expect(ctx.UserModel.updateOne).to.have.been.calledWith(
        { _id: ctx.userId },
        { $set: { permissions: 'basic' } }
      )
    })

    it('should reject an invalid permissions value without touching the database', async function (ctx) {
      await expect(
        ctx.UserPermissionsHandler.promises.setUserPermissions(
          ctx.userId,
          'superuser'
        )
      ).to.be.rejectedWith('Invalid permissions value')
      expect(ctx.UserModel.updateOne).to.not.have.been.called
    })
  })

  describe('getUserPermissions', function () {
    it('should return the stored permissions', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ permissions: 'basic' }) })
      const result =
        await ctx.UserPermissionsHandler.promises.getUserPermissions(ctx.userId)
      expect(result).to.equal('basic')
      expect(ctx.UserModel.findById).to.have.been.calledWith(ctx.userId, {
        permissions: 1,
      })
    })

    it('should default to "full" when the user has no permissions set', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({}) })
      const result =
        await ctx.UserPermissionsHandler.promises.getUserPermissions(ctx.userId)
      expect(result).to.equal('full')
    })

    it('should throw when the user does not exist', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      await expect(
        ctx.UserPermissionsHandler.promises.getUserPermissions(ctx.userId)
      ).to.be.rejectedWith('User not found')
    })
  })

  describe('hasFullPermissions', function () {
    it('should return true when permissions are "full"', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ permissions: 'full' }) })
      const result =
        await ctx.UserPermissionsHandler.promises.hasFullPermissions(ctx.userId)
      expect(result).to.equal(true)
    })

    it('should return true when permissions default to "full"', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({}) })
      const result =
        await ctx.UserPermissionsHandler.promises.hasFullPermissions(ctx.userId)
      expect(result).to.equal(true)
    })

    it('should return false when permissions are "basic"', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ permissions: 'basic' }) })
      const result =
        await ctx.UserPermissionsHandler.promises.hasFullPermissions(ctx.userId)
      expect(result).to.equal(false)
    })

    it('should propagate the error when the user does not exist', async function (ctx) {
      ctx.UserModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      await expect(
        ctx.UserPermissionsHandler.promises.hasFullPermissions(ctx.userId)
      ).to.be.rejectedWith('User not found')
    })
  })
})
