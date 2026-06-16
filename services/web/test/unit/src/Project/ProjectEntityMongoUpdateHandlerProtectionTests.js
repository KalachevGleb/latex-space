const { expect } = require('chai')
const sinon = require('sinon')
const { ObjectId } = require('mongodb-legacy')
const SandboxedModule = require('sandboxed-module')
const Errors = require('../../../../app/src/Features/Errors/Errors')

const MODULE_PATH =
  '../../../../app/src/Features/Project/ProjectEntityMongoUpdateHandler'

// Custom feature: files listed in project.protectedFiles cannot be modified or
// deleted, UNLESS the request comes through the Service API (which sets
// isServiceAuth in AsyncLocalStorage). These tests pin down that enforcement.
describe('ProjectEntityMongoUpdateHandler (protected files)', function () {
  // Resolves the rejection of a promise and returns the error (avoids relying
  // on chai-as-promised being configured in the backend bootstrap).
  async function getRejection(promise) {
    try {
      await promise
    } catch (err) {
      return err
    }
    throw new Error('expected the promise to reject, but it resolved')
  }

  beforeEach(function () {
    this.projectId = new ObjectId()
    this.fileId = new ObjectId()
    this.userId = new ObjectId().toString()
    this.protectedPath = '/protected.tex'

    this.project = {
      _id: this.projectId,
      name: 'project',
      overleaf: {},
      rootFolder: [{ _id: new ObjectId() }],
      protectedFiles: [],
    }

    this.ProjectGetter = {
      promises: {
        getProjectWithoutLock: sinon.stub().resolves(this.project),
      },
    }

    this.filePath = {
      fileSystem: this.protectedPath,
      mongo: 'rootFolder.0.fileRefs.0',
    }
    this.ProjectLocator = {
      promises: {
        findElement: sinon.stub().resolves({
          element: { _id: this.fileId, name: 'protected.tex' },
          path: this.filePath,
          folder: this.project.rootFolder[0],
        }),
      },
    }

    // Marker error thrown by the DB layer: reaching it means the protection
    // check was passed (not blocked).
    this.reachedDb = new Error('REACHED_DB')
    this.Project = {
      findOneAndUpdate: sinon
        .stub()
        .returns({ exec: sinon.stub().rejects(this.reachedDb) }),
    }

    // Controls isServiceAuth: getStore() returns undefined (not service auth)
    // by default; tests override with .returns({ isServiceAuth: true }).
    this.getStore = sinon.stub().returns(undefined)
    this.AsyncLocalStorage = { storage: { getStore: this.getStore } }

    this.LockManager = {
      promises: { runWithLock: (namespace, id, runner) => runner() },
    }

    this.subject = SandboxedModule.require(MODULE_PATH, {
      requires: {
        'mongodb-legacy': { ObjectId },
        '@overleaf/settings': { maxEntitiesPerProject: 100 },
        '../Cooldown/CooldownManager': {},
        '../../models/Folder': { Folder: sinon.stub() },
        '../../infrastructure/LockManager': this.LockManager,
        '../../models/Project': { Project: this.Project },
        './ProjectEntityHandler': {},
        './ProjectLocator': this.ProjectLocator,
        './ProjectGetter': this.ProjectGetter,
        './FolderStructureBuilder': {},
        '../../infrastructure/AsyncLocalStorage': this.AsyncLocalStorage,
      },
    })

    this.newFileRef = {
      _id: new ObjectId(),
      linkedFileData: { provider: 'url' },
      hash: 'new-hash',
    }
  })

  describe('replaceFileWithNew', function () {
    it('refuses to modify a protected file without service auth', async function () {
      this.project.protectedFiles = [this.protectedPath]

      const err = await getRejection(
        this.subject.promises.replaceFileWithNew(
          this.projectId,
          this.fileId,
          this.newFileRef,
          this.userId
        )
      )
      expect(err).to.be.instanceof(Errors.InvalidNameError)
      expect(err.message).to.contain('protected file')
      expect(this.Project.findOneAndUpdate).to.not.have.been.called
    })

    it('allows modifying a protected file via the Service API', async function () {
      this.project.protectedFiles = [this.protectedPath]
      this.getStore.returns({ isServiceAuth: true })

      const err = await getRejection(
        this.subject.promises.replaceFileWithNew(
          this.projectId,
          this.fileId,
          this.newFileRef,
          this.userId
        )
      )
      // It got past the protection check and reached the DB layer.
      expect(err).to.equal(this.reachedDb)
      expect(this.Project.findOneAndUpdate).to.have.been.called
    })

    it('allows modifying a file that is not protected', async function () {
      this.project.protectedFiles = ['/some-other-file.tex']

      const err = await getRejection(
        this.subject.promises.replaceFileWithNew(
          this.projectId,
          this.fileId,
          this.newFileRef,
          this.userId
        )
      )
      expect(err).to.equal(this.reachedDb)
      expect(this.Project.findOneAndUpdate).to.have.been.called
    })
  })

  describe('deleteEntity', function () {
    it('refuses to delete a protected file without service auth', async function () {
      this.project.protectedFiles = [this.protectedPath]

      const err = await getRejection(
        this.subject.promises.deleteEntity(
          this.projectId,
          this.fileId,
          'file',
          this.userId
        )
      )
      expect(err).to.be.instanceof(Errors.NonDeletableEntityError)
      expect(err.message).to.contain('protected file')
      expect(this.Project.findOneAndUpdate).to.not.have.been.called
    })

    it('allows deleting a protected file via the Service API', async function () {
      this.project.protectedFiles = [this.protectedPath]
      this.getStore.returns({ isServiceAuth: true })

      const err = await getRejection(
        this.subject.promises.deleteEntity(
          this.projectId,
          this.fileId,
          'file',
          this.userId
        )
      )
      expect(err).to.equal(this.reachedDb)
      expect(this.Project.findOneAndUpdate).to.have.been.called
    })

    it('allows deleting a file that is not protected', async function () {
      this.project.protectedFiles = []

      const err = await getRejection(
        this.subject.promises.deleteEntity(
          this.projectId,
          this.fileId,
          'file',
          this.userId
        )
      )
      expect(err).to.equal(this.reachedDb)
      expect(this.Project.findOneAndUpdate).to.have.been.called
    })
  })
})
