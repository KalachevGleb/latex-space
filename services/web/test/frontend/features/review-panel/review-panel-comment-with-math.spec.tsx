import { render, screen, waitFor } from '@testing-library/react'
import { ReviewPanelCommentWithMath } from '../../../../frontend/js/features/review-panel/components/review-panel-comment-with-math'
import { expect } from 'chai'

// Mock MathJax loading
const mockMathJax = {
  typesetPromise: cy.stub().resolves(),
  typesetClear: cy.stub(),
  startup: {
    promise: Promise.resolve(),
  },
  svgStylesheet: cy.stub().returns(document.createElement('style')),
}

describe('<ReviewPanelCommentWithMath />', function () {
  beforeEach(function () {
    // Mock the loadMathJax function
    cy.stub(window, 'MathJax').value(mockMathJax)
  })

  it('renders comment content', function () {
    const content = 'This is a test comment'
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
      />
    )
    cy.contains(content).should('exist')
  })

  it('renders comment with formula notation', function () {
    const content = 'This formula $E = mc^2$ should be rendered'
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
      />
    )
    cy.contains('This formula').should('exist')
    cy.contains('should be rendered').should('exist')
  })

  it('expands long content when clicking show more', function () {
    const content = 'A'.repeat(150) // Create content longer than the default limit
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
        contentLimit={100}
      />
    )
    cy.findByText('Show more').should('exist')
    cy.findByText('Show more').click()
    cy.findByText('Show less').should('exist')
  })

  it('truncates content with ellipsis when over limit', function () {
    const content = 'A'.repeat(150)
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
        contentLimit={100}
      />
    )
    cy.contains('...').should('exist')
  })

  it('renders URLs as clickable links', function () {
    const content = 'Check this link: https://example.com'
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
      />
    )
    cy.get('a[href="https://example.com"]').should('exist')
    cy.get('a[href="https://example.com"]').should(
      'have.attr',
      'target',
      '_blank'
    )
    cy.get('a[href="https://example.com"]').should(
      'have.attr',
      'rel',
      'noreferrer noopener'
    )
  })

  it('handles multiline content', function () {
    const content = 'Line 1\nLine 2\nLine 3'
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
        checkNewLines
        newLineCharsLimit={2}
      />
    )
    cy.contains('Line 1').should('exist')
    // Should be truncated at second newline
    cy.findByText('Show more').should('exist')
  })

  it('renders comment with inline and display math', function () {
    const content =
      'Inline: $\\alpha + \\beta$ and display: $$\\int_0^1 x^2 dx$$'
    cy.mount(
      <ReviewPanelCommentWithMath
        content={content}
        className="review-panel-comment-body"
      />
    )
    cy.contains('Inline:').should('exist')
    cy.contains('and display:').should('exist')
  })

  it('applies custom className', function () {
    cy.mount(
      <ReviewPanelCommentWithMath
        content="test"
        className="custom-class-name"
      />
    )
    cy.get('.review-panel-expandable-content.custom-class-name').should('exist')
  })

  it('respects translate attribute', function () {
    cy.mount(
      <ReviewPanelCommentWithMath content="test" translate="no" />
    )
    cy.get('.review-panel-expandable-content[translate="no"]').should('exist')
  })
})

