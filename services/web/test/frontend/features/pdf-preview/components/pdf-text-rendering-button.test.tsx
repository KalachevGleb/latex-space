import { expect } from 'chai'
import sinon from 'sinon'
import { screen, render, fireEvent } from '@testing-library/react'

import PdfTextRenderingButton from '../../../../../frontend/js/features/pdf-preview/components/pdf-text-rendering-button'
import PdfZoomDropdown from '../../../../../frontend/js/features/pdf-preview/components/pdf-zoom-dropdown'

describe('<PdfTextRenderingButton />', function () {
  it('lists the modes and marks the current one', function () {
    render(
      <PdfTextRenderingButton
        textRendering="crisp"
        setTextRendering={sinon.stub()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Text rendering' }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map(item => item.textContent)).to.deep.equal([
      'Standard',
      'Crispcheck',
      'Crisp + ClearType',
    ])
    expect(
      screen
        .getByRole('menuitem', { name: 'Crisp' })
        .getAttribute('aria-current')
    ).to.equal('true')
  })

  it('switches the mode', function () {
    const setTextRendering = sinon.stub()
    render(
      <PdfTextRenderingButton
        textRendering="crisp-cleartype"
        setTextRendering={setTextRendering}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Text rendering' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Standard' }))
    expect(setTextRendering).to.have.been.calledOnceWith('standard')
  })
})

describe('<PdfZoomDropdown /> text rendering', function () {
  const props = {
    requestPresentationMode: sinon.stub(),
    setZoom: sinon.stub(),
    rawScale: 1,
  }

  it('has no text rendering section when the toolbar has the button', function () {
    render(<PdfZoomDropdown {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect(screen.queryByRole('menuitem', { name: 'Standard' })).to.equal(null)
  })

  it('switches the mode from the zoom menu in a narrow toolbar', function () {
    const setTextRendering = sinon.stub()
    render(
      <PdfZoomDropdown
        {...props}
        textRendering="crisp"
        setTextRendering={setTextRendering}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Crisp + ClearType' }))
    expect(setTextRendering).to.have.been.calledOnceWith('crisp-cleartype')
    expect(props.setZoom).not.to.have.been.called
  })
})
