import { ElementType } from 'react'
import { useTranslation } from 'react-i18next'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import getMeta from '../../../utils/meta'
import { useBroadcastUser } from '@/shared/hooks/user-channel/use-broadcast-user'
import OLNotification from '@/shared/components/ol/ol-notification'

const availableIntegrationLinkingWidgets = importOverleafModules(
  'integrationLinkingWidgets'
) as any[]
const availableReferenceLinkingWidgets = importOverleafModules(
  'referenceLinkingWidgets'
) as any[]
const availableLangFeedbackLinkingWidgets = importOverleafModules(
  'langFeedbackLinkingWidgets'
) as any[]

function LinkingSection() {
  useBroadcastUser()
  const { t } = useTranslation()
  const cannotUseAi = getMeta('ol-cannot-use-ai')
  const projectSyncSuccessMessage = getMeta('ol-projectSyncSuccessMessage')

  // hide linking widgets in CI
  const integrationLinkingWidgets = getMeta('ol-hideLinkingWidgets')
    ? []
    : availableIntegrationLinkingWidgets
  const referenceLinkingWidgets = getMeta('ol-hideLinkingWidgets')
    ? []
    : availableReferenceLinkingWidgets
  const langFeedbackLinkingWidgets = getMeta('ol-hideLinkingWidgets')
    ? []
    : availableLangFeedbackLinkingWidgets

  const oauth2ServerComponents = importOverleafModules('oauth2Server') as {
    import: { default: ElementType }
    path: string
  }[]

  const renderSyncSection =
    getMeta('ol-isSaas') || getMeta('ol-gitBridgeEnabled')

  const allIntegrationLinkingWidgets = integrationLinkingWidgets.concat(
    oauth2ServerComponents
  )

  // since we only have Writefull here currently, we should hide the whole section if they cant use ai
  const haslangFeedbackLinkingWidgets =
    langFeedbackLinkingWidgets.length && !cannotUseAi
  const hasIntegrationLinkingSection =
    renderSyncSection && allIntegrationLinkingWidgets.length
  const hasReferencesLinkingSection = referenceLinkingWidgets.length

  if (
    !haslangFeedbackLinkingWidgets &&
    !hasIntegrationLinkingSection &&
    !hasReferencesLinkingSection
  ) {
    return null
  }

  return (
    <>
      {haslangFeedbackLinkingWidgets ? (
        <>
          <h3 id="language-feedback">{t('ai_features')}</h3>
          {langFeedbackLinkingWidgets.map(
            ({ import: { default: widget }, path }, widgetIndex) => (
              <ModuleLinkingWidget
                key={path}
                ModuleComponent={widget}
                isLast={widgetIndex === langFeedbackLinkingWidgets.length - 1}
              />
            )
          )}
        </>
      ) : null}
      {hasIntegrationLinkingSection ? (
        <>
          <h3 id="project-sync">{t('project_synchronisation')}</h3>
          {projectSyncSuccessMessage ? (
            <OLNotification
              type="success"
              content={projectSyncSuccessMessage}
            />
          ) : null}
          <div className="settings-widgets-container">
            {allIntegrationLinkingWidgets.map(
              ({ import: importObject }, widgetIndex) => (
                <ModuleLinkingWidget
                  key={Object.keys(importObject)[0]}
                  ModuleComponent={Object.values(importObject)[0]}
                  isLast={
                    widgetIndex === allIntegrationLinkingWidgets.length - 1
                  }
                />
              )
            )}
          </div>
        </>
      ) : null}
      {hasReferencesLinkingSection ? (
        <>
          <h3 id="references">{t('reference_managers')}</h3>
          <div className="settings-widgets-container">
            {referenceLinkingWidgets.map(
              ({ import: importObject }, widgetIndex) => (
                <ModuleLinkingWidget
                  key={Object.keys(importObject)[0]}
                  ModuleComponent={Object.values(importObject)[0]}
                  isLast={widgetIndex === referenceLinkingWidgets.length - 1}
                />
              )
            )}
          </div>
        </>
      ) : null}
      {haslangFeedbackLinkingWidgets ||
      hasIntegrationLinkingSection ||
      hasReferencesLinkingSection ? (
        <hr />
      ) : null}
    </>
  )
}

type LinkingWidgetProps = {
  ModuleComponent: any
  isLast: boolean
}

function ModuleLinkingWidget({ ModuleComponent, isLast }: LinkingWidgetProps) {
  return (
    <>
      <ModuleComponent />
      {isLast ? null : <hr />}
    </>
  )
}

export default LinkingSection
