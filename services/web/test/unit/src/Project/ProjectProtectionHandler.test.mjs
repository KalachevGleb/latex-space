import { vi, expect } from 'vitest'
import sinon from 'sinon'

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectProtectionHandler.mjs'

describe('ProjectProtectionHandler', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = '5bea8747c7bba6012fcaceb3'
    ctx.ProjectModel = {}

    vi.doMock('../../../../app/src/models/Project.js', () => ({
      Project: ctx.ProjectModel,
    }))

    ctx.ProjectProtectionHandler = (await import(MODULE_PATH)).default
  })

  describe('setProjectProtection', function () {
    beforeEach(function (ctx) {
      ctx.ProjectModel.updateOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves() })
    })

    it('should set isProtected on the project', async function (ctx) {
      await ctx.ProjectProtectionHandler.promises.setProjectProtection(
        ctx.projectId,
        true
      )
      expect(ctx.ProjectModel.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $set: { isProtected: true } }
      )
    })

    it('should be able to clear protection', async function (ctx) {
      await ctx.ProjectProtectionHandler.promises.setProjectProtection(
        ctx.projectId,
        false
      )
      expect(ctx.ProjectModel.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $set: { isProtected: false } }
      )
    })

    it('should reject when the update fails', async function (ctx) {
      ctx.ProjectModel.updateOne.returns({
        exec: sinon.stub().rejects(new Error('boom')),
      })
      await expect(
        ctx.ProjectProtectionHandler.promises.setProjectProtection(
          ctx.projectId,
          true
        )
      ).to.be.rejectedWith('boom')
    })
  })

  describe('getProjectProtection', function () {
    it('should return isProtected when the project is protected', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ isProtected: true }) })
      const result =
        await ctx.ProjectProtectionHandler.promises.getProjectProtection(
          ctx.projectId
        )
      expect(result).to.deep.equal({ isProtected: true })
      expect(ctx.ProjectModel.findById).to.have.been.calledWith(ctx.projectId, {
        isProtected: 1,
      })
    })

    it('should default isProtected to false when the field is missing', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({}) })
      const result =
        await ctx.ProjectProtectionHandler.promises.getProjectProtection(
          ctx.projectId
        )
      expect(result).to.deep.equal({ isProtected: false })
    })

    it('should throw when the project does not exist', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      await expect(
        ctx.ProjectProtectionHandler.promises.getProjectProtection(
          ctx.projectId
        )
      ).to.be.rejectedWith('Project not found')
    })
  })

  describe('setProtectedFiles', function () {
    it('should store the protected files list', async function (ctx) {
      ctx.ProjectModel.updateOne = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves() })
      await ctx.ProjectProtectionHandler.promises.setProtectedFiles(
        ctx.projectId,
        ['main.tex', 'refs.bib']
      )
      expect(ctx.ProjectModel.updateOne).to.have.been.calledWith(
        { _id: ctx.projectId },
        { $set: { protectedFiles: ['main.tex', 'refs.bib'] } }
      )
    })
  })

  describe('getProtectedFiles', function () {
    it('should return the protected files list', async function (ctx) {
      ctx.ProjectModel.findById = sinon.stub().returns({
        exec: sinon.stub().resolves({ protectedFiles: ['main.tex'] }),
      })
      const result =
        await ctx.ProjectProtectionHandler.promises.getProtectedFiles(
          ctx.projectId
        )
      expect(result).to.deep.equal(['main.tex'])
    })

    it('should default to an empty array when no files are protected', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({}) })
      const result =
        await ctx.ProjectProtectionHandler.promises.getProtectedFiles(
          ctx.projectId
        )
      expect(result).to.deep.equal([])
    })

    it('should throw when the project does not exist', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      await expect(
        ctx.ProjectProtectionHandler.promises.getProtectedFiles(ctx.projectId)
      ).to.be.rejectedWith('Project not found')
    })
  })

  describe('isFileProtected', function () {
    beforeEach(function (ctx) {
      ctx.ProjectModel.findById = sinon.stub().returns({
        exec: sinon
          .stub()
          .resolves({ protectedFiles: ['main.tex', 'figures/a.png'] }),
      })
    })

    it('should return true for a protected file', async function (ctx) {
      const result =
        await ctx.ProjectProtectionHandler.promises.isFileProtected(
          ctx.projectId,
          'main.tex'
        )
      expect(result).to.equal(true)
    })

    it('should return false for a file that is not protected', async function (ctx) {
      const result =
        await ctx.ProjectProtectionHandler.promises.isFileProtected(
          ctx.projectId,
          'other.tex'
        )
      expect(result).to.equal(false)
    })

    it('should return false when there are no protected files', async function (ctx) {
      ctx.ProjectModel.findById.returns({
        exec: sinon.stub().resolves({}),
      })
      const result =
        await ctx.ProjectProtectionHandler.promises.isFileProtected(
          ctx.projectId,
          'main.tex'
        )
      expect(result).to.equal(false)
    })

    it('should throw when the project does not exist', async function (ctx) {
      ctx.ProjectModel.findById.returns({
        exec: sinon.stub().resolves(null),
      })
      await expect(
        ctx.ProjectProtectionHandler.promises.isFileProtected(
          ctx.projectId,
          'main.tex'
        )
      ).to.be.rejectedWith('Project not found')
    })
  })

  describe('isProjectProtected', function () {
    it('should return true when the project is protected', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ isProtected: true }) })
      const result =
        await ctx.ProjectProtectionHandler.promises.isProjectProtected(
          ctx.projectId
        )
      expect(result).to.equal(true)
    })

    it('should return false when the project is not protected', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves({ isProtected: false }) })
      const result =
        await ctx.ProjectProtectionHandler.promises.isProjectProtected(
          ctx.projectId
        )
      expect(result).to.equal(false)
    })

    it('should return false (not throw) when the project does not exist', async function (ctx) {
      ctx.ProjectModel.findById = sinon
        .stub()
        .returns({ exec: sinon.stub().resolves(null) })
      const result =
        await ctx.ProjectProtectionHandler.promises.isProjectProtected(
          ctx.projectId
        )
      expect(result).to.equal(false)
    })
  })
})
