import { useTranslation } from 'react-i18next'
import {
  Dropdown,
  DropdownHeader,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
} from '@/shared/components/dropdown/dropdown-menu'
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import {
  PDF_TEXT_RENDERING_MODES,
  PdfTextRendering,
  isPdfTextRendering,
} from '../util/crisp-text'

export function usePdfTextRenderingLabels(): Record<PdfTextRendering, string> {
  const { t } = useTranslation()
  return {
    standard: t('pdf_text_rendering_standard'),
    crisp: t('pdf_text_rendering_crisp'),
    'crisp-cleartype': t('pdf_text_rendering_crisp_cleartype'),
  }
}

type PdfTextRenderingItemsProps = {
  textRendering: PdfTextRendering
  // event keys of the items are prefixed with this
  eventKeyPrefix?: string
}

/** the modes of text rendering as items of a dropdown menu */
export function PdfTextRenderingItems({
  textRendering,
  eventKeyPrefix = '',
}: PdfTextRenderingItemsProps) {
  const labels = usePdfTextRenderingLabels()
  return (
    <>
      {PDF_TEXT_RENDERING_MODES.map(mode => (
        <li role="none" key={mode}>
          <DropdownItem
            as="button"
            eventKey={`${eventKeyPrefix}${mode}`}
            active={mode === textRendering}
            aria-current={mode === textRendering}
            trailingIcon={mode === textRendering ? 'check' : null}
          >
            {labels[mode]}
          </DropdownItem>
        </li>
      ))}
    </>
  )
}

type PdfTextRenderingButtonProps = {
  textRendering: PdfTextRendering
  setTextRendering: (mode: PdfTextRendering) => void
}

/**
 * Toolbar button for the text rendering mode. The mode depends on the
 * screen, so it is kept in this browser (localStorage), not in the account.
 */
export default function PdfTextRenderingButton({
  textRendering,
  setTextRendering,
}: PdfTextRenderingButtonProps) {
  const { t } = useTranslation()
  const labels = usePdfTextRenderingLabels()

  return (
    <Dropdown
      align="end"
      onSelect={eventKey => {
        if (isPdfTextRendering(eventKey)) setTextRendering(eventKey)
      }}
    >
      <OLTooltip
        id="pdf-text-rendering-tooltip"
        description={`${t('pdf_text_rendering')}: ${labels[textRendering]}`}
        overlayProps={{ placement: 'bottom' }}
      >
        <span>
          <DropdownToggle
            id="pdf-text-rendering-dropdown"
            variant="link"
            className="pdf-toolbar-btn pdfjs-toolbar-button pdfjs-text-rendering-toggle"
            aria-label={t('pdf_text_rendering')}
          >
            <MaterialIcon type="text_fields" />
          </DropdownToggle>
        </span>
      </OLTooltip>
      <DropdownMenu>
        <DropdownHeader aria-hidden="true">
          {t('pdf_text_rendering')}
        </DropdownHeader>
        <PdfTextRenderingItems textRendering={textRendering} />
      </DropdownMenu>
    </Dropdown>
  )
}
