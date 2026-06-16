import CodeMirrorEditor from '../../../../frontend/js/features/source-editor/components/codemirror-editor'
import {
  EditorProviders,
  makeProjectProvider,
  USER_EMAIL,
  USER_ID,
} from '../../helpers/editor-providers'
import { mockScope } from '../source-editor/helpers/mock-scope'
import { TestContainer } from '../source-editor/helpers/test-container'
import { docId } from '../source-editor/helpers/mock-doc'
import { mockProject } from '../source-editor/helpers/mock-project'

// Regression test for the reported bug: the Overview tab and the Resolved
// comments menu only showed comments from the currently-open file. Here the
// comment lives in a DIFFERENT file (foo.tex / fake-nested-doc-id, which the
// mock project tree already contains) than the open one (test.tex / docId).

const OTHER_DOC_ID = 'fake-nested-doc-id'
const OTHER_DOC_NAME = 'foo.tex'

const userData = {
  avatar_text: 'User',
  email: USER_EMAIL,
  hue: 180,
  id: USER_ID,
  isSelf: true,
  first_name: 'Test',
  last_name: 'User',
}

const otherFileUnresolvedThreadId = 'other-file-unresolved-thread'
const otherFileResolvedThreadId = 'other-file-resolved-thread'

function mountWithOtherFileComments() {
  window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  cy.interceptEvents()

  cy.intercept('GET', '/project/*/changes/users', [])

  cy.intercept('GET', '/project/*/threads', {
    [otherFileUnresolvedThreadId]: {
      messages: [
        {
          content: 'comment in another file',
          id: `${otherFileUnresolvedThreadId}-1`,
          timestamp: new Date('2025-01-01T00:00:00.000Z'),
          user: userData,
          user_id: USER_ID,
        },
      ],
    },
    [otherFileResolvedThreadId]: {
      messages: [
        {
          content: 'resolved comment in another file',
          id: `${otherFileResolvedThreadId}-1`,
          timestamp: new Date('2025-01-01T00:00:00.000Z'),
          user: userData,
          user_id: USER_ID,
        },
      ],
      resolved: true,
      resolved_at: new Date('2025-01-02T00:00:00.000Z').toISOString(),
      resolved_by_user_id: USER_ID,
      resolved_by_user: userData,
    },
  })

  // The current document (docId/test.tex) has no ranges; both comments belong
  // to the OTHER document and must still surface in the project-wide views.
  cy.intercept('GET', '/project/*/ranges', [
    {
      id: OTHER_DOC_ID,
      ranges: {
        changes: [],
        comments: [
          {
            id: 'other-unresolved-op',
            op: { p: 5, c: 'another file', t: otherFileUnresolvedThreadId },
          },
          {
            id: 'other-resolved-op',
            op: { p: 20, c: 'resolved here', t: otherFileResolvedThreadId },
          },
        ],
        docId: OTHER_DOC_ID,
      },
    },
  ])

  cy.intercept('POST', `/project/*/doc/${docId}/metadata`, {})

  const scope = mockScope(undefined, {
    docOptions: { rangesOptions: { comments: [], changes: [] } },
  })
  const project = mockProject({
    projectOwner: { _id: USER_ID },
    projectFeatures: { trackChanges: false, trackChangesVisible: true },
  })

  cy.mount(
    <TestContainer className="rp-size-expanded">
      <EditorProviders
        scope={scope}
        providers={{ ProjectProvider: makeProjectProvider(project) }}
      >
        <CodeMirrorEditor />
      </EditorProviders>
    </TestContainer>
  )

  // Open the review panel
  cy.findByText('contentLine 0').type('{command}j', { scrollBehavior: false })
  cy.findByText('contentLine 1').type('{ctrl}j', { scrollBehavior: false })
  cy.findByTestId('review-panel').as('review-panel')
}

describe('<ReviewPanel /> comments from other files', function () {
  beforeEach(mountWithOtherFileComments)

  it('shows an active comment from another file in the Overview tab', function () {
    cy.findByRole('tab', { name: /overview/i }).click()
    cy.get('@review-panel').within(function () {
      cy.findByText(OTHER_DOC_NAME).should('exist')
      cy.findByText('comment in another file').should('exist')
    })
  })

  it('shows a resolved comment from another file in the Resolved comments menu', function () {
    cy.findByLabelText('Resolved comments').click()
    cy.findByRole('tooltip')
      .should('exist')
      .within(function () {
        cy.findByText(OTHER_DOC_NAME).should('exist')
        cy.findByText('resolved comment in another file').should('exist')
      })
  })
})
