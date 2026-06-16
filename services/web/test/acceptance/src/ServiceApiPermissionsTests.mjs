import { expect } from 'chai'
import bcrypt from 'bcrypt'
import Settings from '@overleaf/settings'
import mongodb from 'mongodb-legacy'
import UserHelper from './helpers/User.mjs'
import Request from './helpers/request.js'

const { ObjectId } = mongodb
const User = UserHelper.promises
const SERVICE_PASSWORD = 'test-service-password'

const newId = () => new ObjectId().toString()

// Roles under test and the access level we expect each to have.
//  - read  : any project member (owner, editor, reviewer, readOnly)
//  - write : only owner and full editor (readAndWrite)
const ROLES = ['owner', 'editor', 'reviewer', 'readOnly', 'stranger']

function isAllowed(role, access) {
  if (role === 'stranger') return false
  if (access === 'write') return role === 'owner' || role === 'editor'
  return true // read / comment endpoints: any member
}

// Build the list of custom review/comment endpoints to "poke" for a role.
function buildEndpoints(ctx) {
  const { projectId: p, docId: d, threadId: t, messageId: m } = ctx
  return [
    { name: 'GET threads', access: 'read', method: 'GET', url: `/project/${p}/threads` },
    { name: 'GET ranges', access: 'read', method: 'GET', url: `/project/${p}/ranges` },
    { name: 'GET comments-with-positions', access: 'read', method: 'GET', url: `/api/project/${p}/comments` },
    { name: 'GET changes/users', access: 'read', method: 'GET', url: `/project/${p}/changes/users` },
    { name: 'POST add message', access: 'read', method: 'POST', url: `/project/${p}/doc/${d}/thread/${newId()}/messages`, json: { content: 'a comment' } },
    { name: 'POST resolve thread', access: 'read', method: 'POST', url: `/project/${p}/doc/${d}/thread/${t}/resolve` },
    { name: 'POST reopen thread', access: 'read', method: 'POST', url: `/project/${p}/doc/${d}/thread/${t}/reopen` },
    { name: 'POST edit message', access: 'read', method: 'POST', url: `/project/${p}/thread/${t}/messages/${m}/edit`, json: { content: 'edited' } },
    { name: 'POST set track changes', access: 'read', method: 'POST', url: `/project/${p}/track_changes`, json: { on: true } },
    { name: 'DELETE message', access: 'read', method: 'DELETE', url: `/project/${p}/thread/${t}/messages/${m}` },
    { name: 'DELETE thread', access: 'write', method: 'DELETE', url: `/project/${p}/doc/${d}/thread/${t}` },
    { name: 'POST accept changes', access: 'write', method: 'POST', url: `/project/${p}/doc/${d}/changes/accept`, json: { change_ids: [] } },
  ]
}

describe('Service-to-Service API and permissions', function () {
  let savedServiceApi

  before(async function () {
    savedServiceApi = Settings.serviceApi
    const password = await bcrypt.hash(SERVICE_PASSWORD, 4)
    Settings.serviceApi = { enabled: true, password, localhostOnly: false }
  })

  after(function () {
    Settings.serviceApi = savedServiceApi
  })

  // Shared project with one doc, members in every role, and one seeded thread.
  before(async function () {
    this.ownerS = new User()
    this.editorS = new User()
    this.reviewerS = new User()
    this.readOnlyS = new User()
    this.strangerS = new User()

    await this.ownerS.login()
    await this.editorS.login()
    await this.reviewerS.login()
    await this.readOnlyS.login()
    await this.strangerS.login()

    this.owner = await this.ownerS.get()
    this.editor = await this.editorS.get()
    this.reviewer = await this.reviewerS.get()
    this.readOnly = await this.readOnlyS.get()
    this.stranger = await this.strangerS.get()

    this.projectId = await this.ownerS.createProject('Permission matrix project')
    const project = await this.ownerS.getProject(this.projectId)
    this.rootFolderId = project.rootFolder[0]._id
    this.docId = await this.ownerS.createDocInProject(
      this.projectId,
      this.rootFolderId,
      'main.tex'
    )

    await this.ownerS.addUserToProject(this.projectId, this.editor, 'readAndWrite')
    await this.ownerS.addUserToProject(this.projectId, this.reviewer, 'review')
    await this.ownerS.addUserToProject(this.projectId, this.readOnly, 'readOnly')
    // stranger is intentionally NOT added

    // Seed a thread + message (as owner) for the resolve/edit/delete pokes.
    this.threadId = newId()
    const { body } = await this.ownerS.doRequest('POST', {
      url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.threadId}/messages`,
      json: { content: 'seed comment' },
    })
    this.messageId = body && body.id
  })

  describe('Service API authentication (/service/*)', function () {
    const url = '/service/project/new'
    const projectBody = { projectName: 'Created via service API' }

    it('rejects requests without credentials (401)', async function () {
      const res = await Request.promises.request({
        method: 'POST',
        url,
        json: projectBody,
      })
      expect(res.statusCode).to.equal(401)
    })

    it('rejects a wrong password (401)', async function () {
      const res = await Request.promises.request({
        method: 'POST',
        url,
        json: projectBody,
        auth: { user: 'overleaf', pass: 'wrong-password' },
        headers: { 'X-Overleaf-User-Id': this.owner._id.toString() },
      })
      expect(res.statusCode).to.equal(401)
    })

    it('rejects a wrong username (401)', async function () {
      const res = await Request.promises.request({
        method: 'POST',
        url,
        json: projectBody,
        auth: { user: 'not-overleaf', pass: SERVICE_PASSWORD },
        headers: { 'X-Overleaf-User-Id': this.owner._id.toString() },
      })
      expect(res.statusCode).to.equal(401)
    })

    it('rejects requests when the service API is disabled (403)', async function () {
      Settings.serviceApi.enabled = false
      try {
        const res = await Request.promises.request({
          method: 'POST',
          url,
          json: projectBody,
          auth: { user: 'overleaf', pass: SERVICE_PASSWORD },
          headers: { 'X-Overleaf-User-Id': this.owner._id.toString() },
        })
        expect(res.statusCode).to.equal(403)
      } finally {
        Settings.serviceApi.enabled = true
      }
    })

    it('creates a project on behalf of the X-Overleaf-User-Id user', async function () {
      const res = await Request.promises.request({
        method: 'POST',
        url,
        json: projectBody,
        auth: { user: 'overleaf', pass: SERVICE_PASSWORD },
        headers: { 'X-Overleaf-User-Id': this.owner._id.toString() },
      })
      expect(res.statusCode).to.equal(200)
      expect(res.body.project_id).to.exist
      const created = await this.ownerS.getProject(res.body.project_id)
      expect(created.owner_ref.toString()).to.equal(this.owner._id.toString())
    })

    it('enforces the same project permissions over the service API', async function () {
      const threadUrl = `/service/project/${this.projectId}/doc/${this.docId}/thread/${newId()}`
      // read-only user cannot delete a thread (needs write) -> 403
      const denied = await Request.promises.request({
        method: 'DELETE',
        url: threadUrl,
        auth: { user: 'overleaf', pass: SERVICE_PASSWORD },
        headers: { 'X-Overleaf-User-Id': this.readOnly._id.toString() },
      })
      expect(denied.statusCode).to.equal(403)

      // owner can -> not blocked
      const allowed = await Request.promises.request({
        method: 'DELETE',
        url: threadUrl,
        auth: { user: 'overleaf', pass: SERVICE_PASSWORD },
        headers: { 'X-Overleaf-User-Id': this.owner._id.toString() },
      })
      expect(allowed.statusCode).to.not.be.oneOf([401, 403])
    })
  })

  describe('permission matrix for review/comment endpoints', function () {
    for (const role of ROLES) {
      describe(`as ${role}`, function () {
        for (const ep of buildEndpoints({
          projectId: 'P',
          docId: 'D',
          threadId: 'T',
          messageId: 'M',
        })) {
          const allowed = isAllowed(role, ep.access)
          it(`${allowed ? 'allows' : 'blocks'} ${ep.name}`, async function () {
            const session = this[`${role}S`]
            // rebuild the endpoint with the real ids from the shared setup
            const real = buildEndpoints(this).find(e => e.name === ep.name)
            const { response } = await session.doRequest(real.method, {
              url: real.url,
              json: real.json,
            })
            const msg = `${role} ${real.method} ${real.name} -> ${response.statusCode}`
            if (allowed) {
              expect(response.statusCode, msg).to.not.be.oneOf([401, 403])
            } else {
              expect(response.statusCode, msg).to.be.oneOf([401, 403])
            }
          })
        }
      })
    }
  })

  describe('comment thread lifecycle (correctness, multiple users)', function () {
    beforeEach(async function () {
      this.lifecycleThreadId = newId()
      const { body } = await this.ownerS.doRequest('POST', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}/messages`,
        json: { content: 'owner comment' },
      })
      this.lifecycleMessageId = body.id
    })

    async function getThread(session, projectId, threadId) {
      const { body } = await session.doRequest('GET', {
        url: `/project/${projectId}/threads`,
        json: true,
      })
      return body[threadId]
    }

    it('creates a thread that shows up in /threads with the message', async function () {
      const thread = await getThread(
        this.ownerS,
        this.projectId,
        this.lifecycleThreadId
      )
      expect(thread).to.exist
      expect(thread.messages.map(m => m.content)).to.include('owner comment')
      expect(thread.resolved).to.equal(false)
    })

    it('lets a reviewer reply to the thread', async function () {
      const { response } = await this.reviewerS.doRequest('POST', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}/messages`,
        json: { content: 'reviewer reply' },
      })
      expect(response.statusCode).to.equal(200)
      const thread = await getThread(
        this.ownerS,
        this.projectId,
        this.lifecycleThreadId
      )
      expect(thread.messages.map(m => m.content)).to.include('reviewer reply')
    })

    it('resolves and reopens a thread', async function () {
      const resolveRes = await this.ownerS.doRequest('POST', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}/resolve`,
      })
      expect(resolveRes.response.statusCode).to.equal(204)
      let thread = await getThread(
        this.ownerS,
        this.projectId,
        this.lifecycleThreadId
      )
      expect(thread.resolved).to.equal(true)

      const reopenRes = await this.ownerS.doRequest('POST', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}/reopen`,
      })
      expect(reopenRes.response.statusCode).to.equal(204)
      thread = await getThread(
        this.ownerS,
        this.projectId,
        this.lifecycleThreadId
      )
      expect(thread.resolved).to.equal(false)
    })

    it('edits a message', async function () {
      const res = await this.ownerS.doRequest('POST', {
        url: `/project/${this.projectId}/thread/${this.lifecycleThreadId}/messages/${this.lifecycleMessageId}/edit`,
        json: { content: 'owner comment (edited)' },
      })
      expect(res.response.statusCode).to.equal(204)
      const thread = await getThread(
        this.ownerS,
        this.projectId,
        this.lifecycleThreadId
      )
      expect(thread.messages.map(m => m.content)).to.include(
        'owner comment (edited)'
      )
    })

    it('blocks a read-only user from deleting the thread but allows the editor', async function () {
      const denied = await this.readOnlyS.doRequest('DELETE', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}`,
      })
      expect(denied.response.statusCode).to.equal(403)
      // thread still present
      expect(
        await getThread(this.ownerS, this.projectId, this.lifecycleThreadId)
      ).to.exist

      const allowed = await this.editorS.doRequest('DELETE', {
        url: `/project/${this.projectId}/doc/${this.docId}/thread/${this.lifecycleThreadId}`,
      })
      expect(allowed.response.statusCode).to.equal(204)
      expect(
        await getThread(this.ownerS, this.projectId, this.lifecycleThreadId)
      ).to.not.exist
    })
  })
})
