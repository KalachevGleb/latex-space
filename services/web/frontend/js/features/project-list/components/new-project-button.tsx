import { type JSXElementConstructor, useCallback, useState } from 'react'
import classnames from 'classnames'
import { useTranslation } from 'react-i18next'
import getMeta from '../../../utils/meta'
import NewProjectButtonModal, {
  NewProjectButtonModalVariant,
} from './new-project-button/new-project-button-modal'
import { Nullable } from '../../../../../types/utils'
import { sendMB } from '../../../infrastructure/event-tracking'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import {
  Dropdown,
  DropdownDivider,
  DropdownHeader,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
} from '@/shared/components/dropdown/dropdown-menu'
import { useSendProjectListMB } from '@/features/project-list/components/project-list-events'

type SendTrackingEvent = {
  dropdownMenu: string
  dropdownOpen: boolean
}

type Segmentation = SendTrackingEvent & {
  'welcome-page-redesign': 'default'
}

type ModalMenuClickOptions = {
  modalVariant: NewProjectButtonModalVariant
  dropdownMenuEvent: string
}

type NewProjectButtonProps = {
  id: string
  buttonText?: string
  className?: string
  trackingKey?: string
}

function NewProjectButton({
  id,
  buttonText,
  className,
  trackingKey,
}: NewProjectButtonProps) {
  const { t } = useTranslation()
  const { templateLinks, userHasFullPermissions } = getMeta('ol-ExposedSettings')
  const [modal, setModal] =
    useState<Nullable<NewProjectButtonModalVariant>>(null)
  const sendProjectListMB = useSendProjectListMB()
  const sendTrackingEvent = useCallback(
    ({ dropdownMenu, dropdownOpen }: SendTrackingEvent) => {
      if (trackingKey) {
        let segmentation: Segmentation = {
          'welcome-page-redesign': 'default',
          dropdownMenu,
          dropdownOpen,
        }

        sendMB(trackingKey, segmentation)
      }
    },
    [trackingKey]
  )

  const handleMainButtonClick = useCallback(
    (dropdownOpen: boolean) => {
      sendTrackingEvent({
        dropdownMenu: 'main-button',
        dropdownOpen,
      })
    },
    [sendTrackingEvent]
  )

  const handleModalMenuClick = useCallback(
    (
      e: React.MouseEvent,
      { modalVariant, dropdownMenuEvent }: ModalMenuClickOptions
    ) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: dropdownMenuEvent,
        dropdownOpen: true,
      })
      sendProjectListMB('new-project-click', { item: dropdownMenuEvent })

      setModal(modalVariant)
    },
    [sendProjectListMB, sendTrackingEvent]
  )

  const handleStaticTemplateClick = useCallback(
    (e: React.MouseEvent, template: { trackingKey: string; url: string }) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: template.trackingKey,
        dropdownOpen: true,
      })
      sendProjectListMB('new-project-click', {
        item: template.trackingKey,
        destinationURL: template.url,
      })
    },
    [sendProjectListMB, sendTrackingEvent]
  )

  const [importProjectFromGithubMenu] = importOverleafModules(
    'importProjectFromGithubMenu'
  )

  const ImportProjectFromGithubMenu: JSXElementConstructor<{
    onClick: (e: React.MouseEvent) => void
  }> = importProjectFromGithubMenu?.import.default

  if (userHasFullPermissions === false) return null
  return (
    <>
      <Dropdown
        className={classnames('new-project-dropdown', className)}
        onSelect={handleMainButtonClick}
        onToggle={nextShow => {
          if (nextShow) sendProjectListMB('new-project-expand', undefined)
        }}
      >
        <DropdownToggle
          id={id}
          className="new-project-button"
          variant="primary"
        >
          {buttonText || t('new_project')}
        </DropdownToggle>
        <DropdownMenu>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'blank_project',
                  dropdownMenuEvent: 'blank-project',
                })
              }
            >
              {t('blank_project')}
            </DropdownItem>
          </li>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'example_project',
                  dropdownMenuEvent: 'example-project',
                })
              }
            >
              {t('example_project')}
            </DropdownItem>
          </li>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'upload_project',
                  dropdownMenuEvent: 'upload-project',
                })
              }
            >
              {t('upload_project')}
            </DropdownItem>
          </li>
          <li role="none">
            {ImportProjectFromGithubMenu && (
              <ImportProjectFromGithubMenu
                onClick={e =>
                  handleModalMenuClick(e, {
                    modalVariant: 'import_from_github',
                    dropdownMenuEvent: 'import-from-github',
                  })
                }
              />
            )}
          </li>
          {templateLinks && templateLinks.length > 0 && (
            <>
              <DropdownDivider />
              <DropdownHeader aria-hidden="true">
                {t('templates')}
              </DropdownHeader>
            </>
          )}
          {templateLinks?.map((templateLink, index) => (
            <li role="none" key={`new-project-button-template-${index}`}>
              <DropdownItem
                href={templateLink.url}
                onClick={e => handleStaticTemplateClick(e, templateLink)}
                aria-label={`${templateLink.name} ${t('template')}`}
              >
                {templateLink.name === 'view_all'
                  ? t('view_all')
                  : templateLink.name}
              </DropdownItem>
            </li>
          ))}
        </DropdownMenu>
      </Dropdown>
      <NewProjectButtonModal modal={modal} onHide={() => setModal(null)} />
    </>
  )
}

export default NewProjectButton
