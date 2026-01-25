import { JSXElementConstructor } from 'react'
import { useTranslation } from 'react-i18next'
import Common from './groups/common'
import ConfirmEmail from './groups/confirm-email'
import getMeta from '../../../../utils/meta'
import importOverleafModules from '../../../../../macros/import-overleaf-module.macro'
import AccessibilitySurveyBanner from './accessibility-survey-banner'
import {
  DeprecatedBrowser,
  isDeprecatedBrowser,
} from '@/shared/components/deprecated-browser'

const [usGovBannerModule] = importOverleafModules('usGovBanner')

const USGovBanner: JSXElementConstructor<Record<string, never>> =
  usGovBannerModule?.import.default

function UserNotifications() {
  const { t } = useTranslation()

  return (
    <section
      className="user-notifications notification-list"
      aria-label={t('notification')}
    >
      <ul className="list-unstyled">
        <Common />
        <ConfirmEmail />
        {USGovBanner && <USGovBanner />}
        <AccessibilitySurveyBanner />
        {isDeprecatedBrowser() && <DeprecatedBrowser />}
      </ul>
    </section>
  )
}

export default UserNotifications
