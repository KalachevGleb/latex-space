import { useTranslation } from 'react-i18next'
import EmailCell from './cell'
import OLCol from '@/shared/components/ol/ol-col'
import OLRow from '@/shared/components/ol/ol-row'
import classnames from 'classnames'

function Header() {
  const { t } = useTranslation()

  return (
    <>
      <OLRow>
        <OLCol lg={9} className="d-none d-sm-block">
          <EmailCell>
            <strong>{t('email')}</strong>
          </EmailCell>
        </OLCol>
        <OLCol lg={3} className="d-none d-sm-block">
          <EmailCell className="text-lg-end">
            <strong>{t('actions')}</strong>
          </EmailCell>
        </OLCol>
      </OLRow>
      <div className={classnames('d-none d-sm-block', 'horizontal-divider')} />
      <div className={classnames('d-none d-sm-block', 'horizontal-divider')} />
    </>
  )
}

export default Header
