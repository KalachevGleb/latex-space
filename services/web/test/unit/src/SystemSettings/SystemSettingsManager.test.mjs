import { vi, expect } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/SystemSettings/SystemSettingsManager.mjs'

describe('SystemSettingsManager', function () {
  beforeEach(async function (ctx) {
    ctx.SystemSettings = {}

    vi.doMock('../../../../app/src/models/SystemSettings.js', () => ({
      SystemSettings: ctx.SystemSettings,
    }))

    ctx.SystemSettingsManager = (await import(MODULE_PATH)).default
  })

  describe('getSetting', function () {
    it('should return the stored value when the setting exists', async function (ctx) {
      ctx.SystemSettings.findOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ value: true }) })
      const result =
        await ctx.SystemSettingsManager.promises.getSetting('registrationEnabled')
      expect(result).to.equal(true)
      expect(ctx.SystemSettings.findOne).to.have.been.calledWith({
        key: 'registrationEnabled',
      })
    })

    it('should return the default value when the setting is missing', async function (ctx) {
      ctx.SystemSettings.findOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      const result =
        await ctx.SystemSettingsManager.promises.getSetting('defaultLanguage')
      expect(result).to.equal('en')
    })

    it('should return undefined for an unknown key with no stored value', async function (ctx) {
      ctx.SystemSettings.findOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      const result =
        await ctx.SystemSettingsManager.promises.getSetting('doesNotExist')
      expect(result).to.equal(undefined)
    })

    it('should return falsy stored values rather than the default', async function (ctx) {
      // peerReviewMode default is false; stored value false must round-trip
      ctx.SystemSettings.findOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ value: false }) })
      const result =
        await ctx.SystemSettingsManager.promises.getSetting('peerReviewMode')
      expect(result).to.equal(false)
    })
  })

  describe('setSetting', function () {
    it('should upsert the setting', async function (ctx) {
      ctx.SystemSettings.findOneAndUpdate = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves() })
      await ctx.SystemSettingsManager.promises.setSetting('maxUploadSize', 100)
      expect(ctx.SystemSettings.findOneAndUpdate).to.have.been.calledWith(
        { key: 'maxUploadSize' },
        { key: 'maxUploadSize', value: 100 },
        { upsert: true, new: true }
      )
    })
  })

  describe('getAllSettings', function () {
    it('should merge stored settings over the defaults', async function (ctx) {
      ctx.SystemSettings.find = sinon.stub().returns({
        exec: sinon.stub().resolves([
          { key: 'registrationEnabled', value: true },
          { key: 'adminEmail', value: 'admin@example.com' },
        ]),
      })
      const result = await ctx.SystemSettingsManager.promises.getAllSettings()
      // overridden values
      expect(result.registrationEnabled).to.equal(true)
      expect(result.adminEmail).to.equal('admin@example.com')
      // defaults preserved
      expect(result.defaultLanguage).to.equal('en')
      expect(result.peerReviewMode).to.equal(false)
      expect(result.maxUploadSize).to.equal(50)
      expect(result.additionalTextExtensions).to.deep.equal([])
    })

    it('should return all defaults when nothing is stored', async function (ctx) {
      ctx.SystemSettings.find = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves([]) })
      const result = await ctx.SystemSettingsManager.promises.getAllSettings()
      expect(result.registrationEnabled).to.equal(false)
      expect(result.defaultLanguage).to.equal('en')
      expect(result.maxDocLength).to.equal(2)
    })
  })
})
