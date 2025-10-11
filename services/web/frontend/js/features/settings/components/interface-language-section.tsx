import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getUserFacingMessage,
  postJSON,
} from '../../../infrastructure/fetch-json'
import getMeta from '../../../utils/meta'
import useAsync from '../../../shared/hooks/use-async'
import OLButton from '@/shared/components/ol/ol-button'
import OLNotification from '@/shared/components/ol/ol-notification'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLFormText from '@/shared/components/ol/ol-form-text'

function InterfaceLanguageSection() {
  const { t } = useTranslation()
  
  const AVAILABLE_LANGUAGES = [
    { code: 'default', name: t('site_default_language') || 'Default (use site default)' },
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'pt', name: 'Português' },
    { code: 'it', name: 'Italiano' },
    { code: 'zh-CN', name: '中文 (简体)' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ]
  const userSettings = getMeta('ol-userSettings', {})
  const initialLanguage = userSettings.interfaceLanguage || 'default'

  const [language, setLanguage] = useState(initialLanguage)
  const { isLoading, isSuccess, isError, error, runAsync, reset } = useAsync()

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(reset, 3000)
      return () => clearTimeout(timer)
    }
  }, [isSuccess, reset])

  const handleLanguageChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setLanguage(event.target.value)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runAsync(
      postJSON('/user/settings', {
        body: {
          interfaceLanguage: language,
        },
      })
    )
      .then(() => {
        // Reload the page to apply the new language
        window.location.reload()
      })
      .catch(() => {})
  }

  return (
    <>
      <h3 id="interface-language">{t('interface_language') || 'Interface Language'}</h3>
      <form id="interface-language-form" onSubmit={handleSubmit}>
        <OLFormGroup>
          <OLFormLabel htmlFor="interface-language-select">
            {t('preferred_language') || 'Preferred Language'}
          </OLFormLabel>
          <OLFormSelect
            id="interface-language-select"
            value={language}
            onChange={handleLanguageChange}
          >
            {AVAILABLE_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </OLFormSelect>
          <OLFormText>
            {t('interface_language_help') ||
              'Choose "Default" to use the site-wide language setting configured by your administrator, or select a specific language.'}
          </OLFormText>
        </OLFormGroup>

        {isSuccess ? (
          <OLFormGroup>
            <OLNotification
              type="success"
              content={t('thanks_settings_updated')}
            />
          </OLFormGroup>
        ) : null}
        {isError ? (
          <OLFormGroup>
            <OLNotification
              type="error"
              content={getUserFacingMessage(error) ?? ''}
            />
          </OLFormGroup>
        ) : null}

        <OLFormGroup>
          <OLButton
            variant="primary"
            type="submit"
            disabled={isLoading}
            isLoading={isLoading}
            bs3Props={{
              loading: isLoading ? `${t('saving')}…` : t('update'),
            }}
          >
            {t('update')}
          </OLButton>
        </OLFormGroup>
      </form>
    </>
  )
}

export default InterfaceLanguageSection

