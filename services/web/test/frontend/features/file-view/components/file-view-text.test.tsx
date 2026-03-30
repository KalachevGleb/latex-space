import { screen } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import { renderWithEditorContext } from '../../../helpers/render-with-context'
import FileViewText from '../../../../../frontend/js/features/file-view/components/file-view-text'
import { textFile } from '../util/files'

describe('<FileViewText/>', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  })

  it('renders a text view', async function () {
    fetchMock.head('express:/project/:project_id/blob/:hash', {
      status: 201,
      headers: { 'Content-Length': 10000 },
    })
    fetchMock.get(
      'express:/project/:project_id/blob/:hash',
      'Text file content'
    )

    renderWithEditorContext(
      <FileViewText file={textFile} onError={() => {}} onLoad={() => {}} />
    )

    await screen.findByText('Text file content', { exact: false })
  })

  it('renders fallback utf-8 preview for unknown extensions', async function () {
    fetchMock.head('express:/project/:project_id/blob/:hash', {
      status: 201,
      headers: { 'Content-Length': 100 },
    })
    fetchMock.get('express:/project/:project_id/blob/:hash', {
      body: new TextEncoder().encode('Fallback utf8 content').buffer,
    })

    renderWithEditorContext(
      <FileViewText
        file={textFile}
        onError={() => {}}
        onLoad={() => {}}
        strictUtf8
      />
    )

    await screen.findByText('Fallback utf8 content', { exact: false })
  })
})
