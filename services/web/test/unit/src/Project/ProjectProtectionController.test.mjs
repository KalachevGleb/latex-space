import { vi, expect } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.js'
import MockResponse from '../helpers/MockResponse.js'

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectProtectionController.mjs'

describe('ProjectProtectionController', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = '5bea8747c7bba6012fcaceb3'

    ctx.ProjectProtectionHandler = {
      promises: {
        setProjectProtection: sinon.stub().resolves(),
        getProjectProtection: sinon.stub().resolves({ isProtected: true }),
        setProtectedFiles: sinon.stub().resolves(),
        getProtectedFiles: sinon.stub().resolves(['main.tex']),
        isFileProtected: sinon.stub().resolves(true),
      },
    }

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectProtectionHandler.mjs',
      () => ({ default: ctx.ProjectProtectionHandler })
    )

    ctx.ProjectProtectionController = (await import(MODULE_PATH)).default

    ctx.req = new MockRequest()
    ctx.res = new MockResponse()
    ctx.next = sinon.stub()
  })

  describe('setProjectProtection', function () {
    it('should delegate to the handler and return 204', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
      ctx.req.body = { isProtected: true }

      await ctx.ProjectProtectionController.setProjectProtection(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.ProjectProtectionHandler.promises.setProjectProtection
      ).to.have.been.calledWith(ctx.projectId, true)
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('should fail validation when isProtected is not a boolean', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
      ctx.req.body = { isProtected: 'yes' }

      await ctx.ProjectProtectionController.setProjectProtection(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.next.firstCall.args[0]).to.be.an('error')
      expect(
        ctx.ProjectProtectionHandler.promises.setProjectProtection
      ).to.not.have.been.called
    })
  })

  describe('getProjectProtection', function () {
    it('should return the protection state as JSON', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }

      await ctx.ProjectProtectionController.getProjectProtection(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.ProjectProtectionHandler.promises.getProjectProtection
      ).to.have.been.calledWith(ctx.projectId)
      expect(JSON.parse(ctx.res.body)).to.deep.equal({ isProtected: true })
    })

    it('should forward handler errors to next', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
      const error = new Error('Project not found')
      ctx.ProjectProtectionHandler.promises.getProjectProtection.rejects(error)

      await ctx.ProjectProtectionController.getProjectProtection(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledWith(error)
    })
  })

  describe('setProtectedFiles', function () {
    it('should delegate to the handler and return 204', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
      ctx.req.body = { protectedFiles: ['main.tex', 'refs.bib'] }

      await ctx.ProjectProtectionController.setProtectedFiles(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.ProjectProtectionHandler.promises.setProtectedFiles
      ).to.have.been.calledWith(ctx.projectId, ['main.tex', 'refs.bib'])
      expect(ctx.res.statusCode).to.equal(204)
    })

    it('should fail validation when protectedFiles is not an array of strings', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }
      ctx.req.body = { protectedFiles: [1, 2, 3] }

      await ctx.ProjectProtectionController.setProtectedFiles(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(ctx.next).to.have.been.calledOnce
      expect(ctx.next.firstCall.args[0]).to.be.an('error')
      expect(
        ctx.ProjectProtectionHandler.promises.setProtectedFiles
      ).to.not.have.been.called
    })
  })

  describe('getProtectedFiles', function () {
    it('should return the protected files list as JSON', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId }

      await ctx.ProjectProtectionController.getProtectedFiles(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(JSON.parse(ctx.res.body)).to.deep.equal({
        protectedFiles: ['main.tex'],
      })
    })
  })

  describe('isFileProtected', function () {
    it('should return whether the given file is protected', async function (ctx) {
      ctx.req.params = { Project_id: ctx.projectId, file_path: 'main.tex' }

      await ctx.ProjectProtectionController.isFileProtected(
        ctx.req,
        ctx.res,
        ctx.next
      )

      expect(
        ctx.ProjectProtectionHandler.promises.isFileProtected
      ).to.have.been.calledWith(ctx.projectId, 'main.tex')
      expect(JSON.parse(ctx.res.body)).to.deep.equal({ isProtected: true })
    })
  })
})
