import { v4 as uuid } from 'uuid'
import { isExcludedBySharding, startWith } from './helpers/config'
import { ensureUserExists, login } from './helpers/login'
import {
  createProject,
  getSpamSafeProjectName,
  openProjectByName,
  shareProjectByEmailAndAcceptInviteViaDash,
  waitForMainDocToLoad,
} from './helpers/project'
import { beforeWithReRunOnTestRetry } from './helpers/beforeWithReRunOnTestRetry'

/*
 * Full-stack (live services) end-to-end test for the peer-review features:
 * comments (add / reply / resolve / reopen / overview) and tracked changes
 * (make a suggestion in Reviewing mode / accept it), plus role-based access.
 *
 * This exercises the REAL pipeline (web + document-updater + docstore + chat +
 * real-time), which the web acceptance tests cannot (they mock those services).
 *
 * NOTE: This is a browser E2E and must run against the full Docker stack
 * (macOS/Docker): `cd server-ce/test && npm run cypress:run`. Browser E2Es are
 * timing/selector sensitive; treat selector/timeout tweaks on the first real
 * run as expected.
 */
describe('Peer review: comments and tracked changes (E2E)', function () {
  if (isExcludedBySharding('PRO_CUSTOM_1')) return

  const OWNER = 'rp-owner@example.com'
  const EDITOR = 'rp-editor@example.com'
  const VIEWER = 'rp-viewer@example.com'

  ensureUserExists({ email: OWNER })
  ensureUserExists({ email: EDITOR })
  ensureUserExists({ email: VIEWER })

  startWith({ pro: true, withDataDir: true })

  let projectName: string

  beforeWithReRunOnTestRetry(function () {
    projectName = getSpamSafeProjectName()
    login(OWNER)
    createProject(projectName, { type: 'Example project' })
    waitForMainDocToLoad()
    // Give the two collaborators their roles (helper logs in as each to accept).
    shareProjectByEmailAndAcceptInviteViaDash(projectName, EDITOR, 'Editor')
    shareProjectByEmailAndAcceptInviteViaDash(projectName, VIEWER, 'Viewer')
  })

  beforeEach(() => {
    // wide viewport so the review panel renders expanded (not the mini rail)
    cy.viewport(1600, 900)
  })

  // Select some text in the current document so the floating "add comment"
  // button appears, then file a comment with the given text.
  function addCommentOnFirstLine(commentText: string) {
    cy.get('.cm-content').should('contain.text', 'Introduction')
    cy.contains('.cm-line', 'Introduction').type(
      '{home}' + '{shift}{rightArrow}'.repeat(12),
      { scrollBehavior: false }
    )
    cy.get('.review-tooltip-add-comment-button').click()
    cy.get('.review-panel-add-comment-textarea').type(`${commentText}{enter}`, {
      scrollBehavior: false,
    })
  }

  it('owner can add a comment, resolve it into the Resolved menu, reopen it, and see it in Overview', function () {
    const commentText = `comment-${uuid().slice(0, 8)}`
    login(OWNER)
    openProjectByName(projectName)

    addCommentOnFirstLine(commentText)

    // The comment shows in the review panel (current file)
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(commentText).should('exist')
    })

    // Resolve it
    cy.findByText('Resolve comment').click({ force: true })

    // It must now appear in the "Resolved comments" menu, with a re-open action.
    // (Regression guard for the bug where this list was usually empty.)
    cy.findByLabelText('Resolved comments').click()
    cy.findByRole('tooltip')
      .should('exist')
      .within(() => {
        cy.findByText(commentText).should('exist')
        cy.findByText('Re-open').click({ force: true })
      })

    // Back to unresolved: it shows again in the current file panel...
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(commentText).should('exist')
    })

    // ...and in the Overview tab.
    cy.findByRole('tab', { name: /overview/i }).click()
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(commentText).should('exist')
    })
  })

  it('a collaborator (editor) sees the comment and can reply to it', function () {
    const commentText = `comment-${uuid().slice(0, 8)}`
    const replyText = `reply-${uuid().slice(0, 8)}`

    login(OWNER)
    openProjectByName(projectName)
    addCommentOnFirstLine(commentText)
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(commentText).should('exist')
    })

    // Switch to the editor collaborator
    login(EDITOR)
    openProjectByName(projectName)
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(commentText).should('exist')
    })
    // Reply via the comment's reply textbox
    cy.findByTestId('review-panel').within(() => {
      cy.findByRole('textbox').type(`${replyText}{enter}`, {
        scrollBehavior: false,
      })
    })

    // Owner sees the reply
    login(OWNER)
    openProjectByName(projectName)
    cy.findByTestId('review-panel').within(() => {
      cy.findByText(replyText).should('exist')
    })
  })

  it('owner can make a tracked change in Reviewing mode and accept it', function () {
    const marker = `tracked${uuid().slice(0, 6).replace(/[^a-z]/gi, '')}`
    login(OWNER)
    openProjectByName(projectName)

    // Switch the mode switcher from Editing to Reviewing
    cy.findByLabelText('Editing').click()
    cy.findByText('Reviewing').click()

    // Type at the end of the document; the insertion becomes a tracked change
    cy.get('.cm-content').type(`{moveToEnd} ${marker}`, {
      scrollBehavior: false,
    })

    // Make sure the review panel is open (expanded) to inspect the change
    cy.window().then(w =>
      w.dispatchEvent(new Event('ui.toggle-review-panel'))
    )

    // The tracked insertion appears in the review panel as an "Added" entry
    cy.findByTestId('review-panel').within(() => {
      cy.findByText('Added:').should('exist')
      cy.contains(marker).should('exist')
    })

    // Accept the change
    cy.findByText('Accept change').click({ force: true })

    // After accepting, the tracked-change entry is gone
    cy.findByTestId('review-panel').within(() => {
      cy.findByText('Added:').should('not.exist')
    })
  })

  it('a viewer has read-only access', function () {
    login(VIEWER)
    openProjectByName(projectName)

    // The editor content is present but not editable.
    cy.findByRole('textbox', { name: 'Source Editor editing' }).should(
      'have.attr',
      'contenteditable',
      'false'
    )

    // Read-only users are shown the "Viewing" mode in the switcher.
    cy.findByLabelText('Viewing').should('exist')
  })
})
