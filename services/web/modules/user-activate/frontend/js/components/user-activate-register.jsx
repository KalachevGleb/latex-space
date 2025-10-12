import { useState } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import RegisterForm from './register-form'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import OLCard from '@/shared/components/ol/ol-card'
import Notification from '@/shared/components/notification'

function UserActivateRegister() {
  const { t } = useTranslation()
  const [emails, setEmails] = useState([])
  const [failedEmails, setFailedEmails] = useState([])
  const [registerError, setRegisterError] = useState(false)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)

  return (
    <OLRow>
      <OLCol>
        <OLCard>
          <div className="page-header">
            <h1>{t('register_new_users')}</h1>
          </div>
          <RegisterForm
            setRegistrationSuccess={setRegistrationSuccess}
            setEmails={setEmails}
            setRegisterError={setRegisterError}
            setFailedEmails={setFailedEmails}
          />
          {registerError ? (
            <UserActivateError failedEmails={failedEmails} />
          ) : null}
          {registrationSuccess ? (
            <>
              <SuccessfulRegistrationMessage />
              <hr />
              <DisplayEmailsList emails={emails} />
            </>
          ) : null}
        </OLCard>
      </OLCol>
    </OLRow>
  )
}

function UserActivateError({ failedEmails }) {
  const { t } = useTranslation()
  return (
    <div className="row-spaced">
      <Notification
        type="error"
        content={t('failed_to_register_these_emails')}
        className="mb-3"
      />
      <ul>
        {failedEmails.map(email => (
          <li key={email}>{email}</li>
        ))}
      </ul>
    </div>
  )
}

function SuccessfulRegistrationMessage() {
  const { t } = useTranslation()
  return (
    <div className="row-spaced text-success">
      <p>{t('welcome_emails_sent_to_registered_users')}</p>
      <p>
        {t('manually_send_password_reset_urls')}
      </p>
      <p>
        {t('password_reset_tokens_expire_after_one_week')}
      </p>
    </div>
  )
}

function DisplayEmailsList({ emails }) {
  const { t } = useTranslation()
  return (
    <table className="table table-striped ">
      <tbody>
        <tr>
          <th>{t('email')}</th>
          <th>{t('set_password_url')}</th>
        </tr>
        {emails.map(user => (
          <tr key={user.email}>
            <td>{user.email}</td>
            <td style={{ wordBreak: 'break-all' }}>{user.setNewPasswordUrl}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

DisplayEmailsList.propTypes = {
  emails: PropTypes.array,
}
UserActivateError.propTypes = {
  failedEmails: PropTypes.array,
}

export default UserActivateRegister
