import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/ServerAdmin/ServiceApiController.mjs'

describe('ServiceApiController', function () {
  beforeEach(async function (ctx) {
    ctx.Settings = { security: { bcryptRounds: 10 } }

    ctx.settingsStore = {
      serviceApiEnabled: true,
      serviceApiPassword: 'stored-hash',
      serviceApiLocalhostOnly: false,
    }
    ctx.SystemSettingsManager = {
      promises: {
        getSetting: sinon
          .stub()
          .callsFake(async key => ctx.settingsStore[key]),
        setSetting: sinon.stub().resolves(),
      },
    }

    ctx.bcrypt = { hash: sinon.stub().resolves('new-hash') }

    vi.doMock('@overleaf/settings', () => ({ default: ctx.Settings }))
    vi.doMock('bcrypt', () => ({ default: ctx.bcrypt }))
    vi.doMock(
      '../../../../app/src/Features/SystemSettings/SystemSettingsManager.mjs',
      () => ({ default: ctx.SystemSettingsManager })
    )

    ctx.ServiceApiController = await import(MODULE_PATH)

    ctx.req = new MockRequest()
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  describe('getServiceApiSettings', function () {
    it('should report enabled/localhostOnly and that a password is set', async function (ctx) {
      await ctx.ServiceApiController.getServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        enabled: true,
        hasPassword: true,
        localhostOnly: false,
      })
    })

    it('should report hasPassword false when no password is stored', async function (ctx) {
      ctx.settingsStore.serviceApiPassword = null

      await ctx.ServiceApiController.getServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(JSON.parse(ctx.res.body).hasPassword).to.equal(false)
    })

    it('should forward errors to next', async function (ctx) {
      const error = new Error('db error')
      ctx.SystemSettingsManager.promises.getSetting.rejects(error)

      await ctx.ServiceApiController.getServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })
  })

  describe('updateServiceApiSettings', function () {
    it('should persist enabled and localhostOnly flags', async function (ctx) {
      ctx.req.body = { enabled: false, localhostOnly: true }

      await ctx.ServiceApiController.updateServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.SystemSettingsManager.promises.setSetting
      ).to.have.been.calledWith('serviceApiEnabled', false)
      expect(
        ctx.SystemSettingsManager.promises.setSetting
      ).to.have.been.calledWith('serviceApiLocalhostOnly', true)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({ success: true })
      // runtime Settings updated
      expect(ctx.Settings.serviceApi.enabled).to.equal(false)
      expect(ctx.Settings.serviceApi.localhostOnly).to.equal(true)
    })

    it('should hash the password when a new one is supplied', async function (ctx) {
      ctx.req.body = { password: '  s3cret  ' }

      await ctx.ServiceApiController.updateServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.bcrypt.hash).to.have.been.calledWith('s3cret', 10)
      expect(
        ctx.SystemSettingsManager.promises.setSetting
      ).to.have.been.calledWith('serviceApiPassword', 'new-hash')
      expect(ctx.Settings.serviceApi.password).to.equal('new-hash')
    })

    it('should not hash a blank password', async function (ctx) {
      // no password currently stored, so a blank password must not create one
      ctx.settingsStore.serviceApiPassword = null
      ctx.req.body = { password: '   ' }

      await ctx.ServiceApiController.updateServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.bcrypt.hash).to.not.have.been.called
      expect(
        ctx.SystemSettingsManager.promises.setSetting
      ).to.not.have.been.calledWith('serviceApiPassword', sinon.match.any)
    })

    it('should forward errors to next', async function (ctx) {
      const error = new Error('save failed')
      ctx.SystemSettingsManager.promises.setSetting.rejects(error)
      ctx.req.body = { enabled: true }

      await ctx.ServiceApiController.updateServiceApiSettings(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })
  })

  describe('generateServiceApiPassword', function () {
    it('should return a non-empty generated password', async function (ctx) {
      await ctx.ServiceApiController.generateServiceApiPassword(
        ctx.req,
        ctx.res,
        ctx.next
      )

      const body = JSON.parse(ctx.res.body)
      expect(body.password).to.be.a('string')
      expect(body.password.length).to.be.greaterThan(0)
    })

    it('should generate a different password each call', async function (ctx) {
      await ctx.ServiceApiController.generateServiceApiPassword(
        ctx.req,
        ctx.res,
        ctx.next
      )
      const first = JSON.parse(ctx.res.body).password

      ctx.res = new MockResponse()
      await ctx.ServiceApiController.generateServiceApiPassword(
        ctx.req,
        ctx.res,
        ctx.next
      )
      const second = JSON.parse(ctx.res.body).password

      expect(first).to.not.equal(second)
    })
  })
})
