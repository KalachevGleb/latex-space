import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import FileViewHeader from './file-view-header'
import FileViewImage from './file-view-image'
import FileViewPdf from './file-view-pdf'
import FileViewText from './file-view-text'
import LoadingSpinner from '@/shared/components/loading-spinner'
import getMeta from '@/utils/meta'
import { BinaryFile } from '../types/binary-file'

const imageExtensions = ['png', 'jpg', 'jpeg', 'gif']
const knownNonTextExtensions = new Set([
  'pdf',
  'bin',
  'exe',
  'dll',
  'so',
  'dylib',
  'zip',
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'tar',
  'jar',
  'war',
  'ear',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'svg',
  'tif',
  'tiff',
  'heic',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'mp4',
  'm4v',
  'mov',
  'avi',
  'mkv',
  'webm',
  'wmv',
  'otf',
  'ttf',
  'woff',
  'woff2',
  'eot',
  'class',
  'pyc',
  'o',
  'a',
  'obj',
  'lib',
  'iso',
])

export default function FileView({ file }: { file: BinaryFile }) {
  const [contentLoading, setContentLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const { t } = useTranslation()

  const { textExtensions, editableFilenames } = getMeta('ol-ExposedSettings')

  const extension = file.name.split('.')?.pop()?.toLowerCase()

  const isEditableTextFile =
    (extension && textExtensions.includes(extension)) ||
    editableFilenames.includes(file.name.toLowerCase())

  const isImageFile = !!extension && imageExtensions.includes(extension)
  const isPdfFile = extension === 'pdf'
  const isKnownNonTextFile =
    extension != null && knownNonTextExtensions.has(extension)
  const shouldUseFallbackTextPreview =
    !isEditableTextFile && !isImageFile && !isPdfFile && !isKnownNonTextFile
  const isUnpreviewableFile =
    !isEditableTextFile && !isImageFile && !isPdfFile && !shouldUseFallbackTextPreview

  const handleLoad = useCallback(() => {
    setContentLoading(false)
  }, [])

  const handleError = useCallback(() => {
    if (!hasError) {
      setContentLoading(false)
      setHasError(true)
    }
  }, [hasError])

  const content = (
    <>
      <FileViewHeader file={file} />
      {isImageFile && (
        <FileViewImage file={file} onLoad={handleLoad} onError={handleError} />
      )}
      {(isEditableTextFile || shouldUseFallbackTextPreview) && (
        <FileViewText
          file={file}
          onLoad={handleLoad}
          onError={handleError}
          strictUtf8={shouldUseFallbackTextPreview}
        />
      )}
      {isPdfFile && (
        <FileViewPdf
          fileId={file.id}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </>
  )

  return (
    <div className="file-view full-size">
      {!hasError && content}
      {!isUnpreviewableFile && contentLoading && <FileViewLoadingIndicator />}
      {(isUnpreviewableFile || hasError) && (
        <p className="no-preview">{t('no_preview_available')}</p>
      )}
    </div>
  )
}

function FileViewLoadingIndicator() {
  return (
    <div
      className="loading-panel loading-panel-file-view"
      data-testid="loading-panel-file-view"
    >
      <LoadingSpinner />
    </div>
  )
}
