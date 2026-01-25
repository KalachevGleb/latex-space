import { expect } from 'chai'
import { screen, fireEvent, render, within } from '@testing-library/react'
import { IntegrationLinkingWidget } from '../../../../../../frontend/js/features/settings/components/linking/integration-widget'

describe('<IntegrationLinkingWidgetTest/>', function () {
  const defaultProps = {
    id: 'integration-widget-id',
    logo: <div />,
    title: 'Integration',
    description: 'paragraph1',
    helpPath: '/learn',
    linkPath: '/link',
    unlinkPath: '/unlink',
    unlinkConfirmationTitle: 'confirm unlink',
    unlinkConfirmationText: 'you will be unlinked',
  }

  describe('when the integration is not linked', function () {
    beforeEach(function () {
      render(
        <IntegrationLinkingWidget {...defaultProps} hasFeature linked={false} />
      )
    })

    it('should render a link to initiate integration linking', function () {
      expect(
        screen
          .getByRole('link', { name: 'Link Integration' })
          .getAttribute('href')
      ).to.equal('/link')
    })

    it("should not render 'premium feature' labels", function () {
      expect(screen.queryByText('premium_feature')).to.not.exist
      expect(screen.queryByText('integration_is_a_premium_feature')).to.not
        .exist
    })
  })

  describe('when the integration is linked', function () {
    beforeEach(function () {
      render(
        <IntegrationLinkingWidget
          {...defaultProps}
          hasFeature
          linked
          statusIndicator={<div>status indicator</div>}
        />
      )
    })

    it('should render a status indicator', function () {
      screen.getByText('status indicator')
    })

    it("should not render 'premium feature' labels", function () {
      expect(screen.queryByText('premium_feature')).to.not.exist
      expect(screen.queryByText('integration_is_a_premium_feature')).to.not
        .exist
    })

    it('should display an `unlink` button', function () {
      screen.getByRole('button', { name: 'Unlink Integration' })
    })

    it('should open a modal with a link to confirm integration unlinking', function () {
      fireEvent.click(
        screen.getByRole('button', { name: 'Unlink Integration' })
      )
      const withinModal = within(screen.getByRole('dialog'))
      withinModal.getByText('confirm unlink')
      withinModal.getByText('you will be unlinked')
      withinModal.getByRole('button', { name: 'Cancel' })
      withinModal.getByRole('button', { name: 'Unlink' })
    })

    it('should cancel unlinking when clicking "cancel" in the confirmation modal', async function () {
      fireEvent.click(
        screen.getByRole('button', { name: 'Unlink Integration' })
      )
      screen.getByText('confirm unlink')
      const cancelBtn = screen.getByRole('button', {
        name: 'Cancel',
        hidden: false,
      })
      fireEvent.click(cancelBtn)
      await screen.findByRole('button', { name: 'Cancel', hidden: true })
    })
  })
})
