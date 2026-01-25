import { useTranslation, Trans } from 'react-i18next'
import Notification from '../notification'
import getMeta from '../../../../../utils/meta'
import useAsyncDismiss from '../hooks/useAsyncDismiss'
import useAsync from '../../../../../shared/hooks/use-async'
import { FetchError, postJSON } from '../../../../../infrastructure/fetch-json'
import {
  NotificationProjectInvite,
  Notification as NotificationType,
} from '../../../../../../../types/project/dashboard/notification'
import { debugConsole } from '@/utils/debugging'
import OLButton from '@/shared/components/ol/ol-button'

function Common() {
  const notifications = getMeta('ol-notifications') || []
  if (!notifications.length) {
    return null
  }

  return (
    <>
      {notifications.map((notification, index) => (
        <CommonNotification notification={notification} key={index} />
      ))}
    </>
  )
}

type CommonNotificationProps = {
  notification: NotificationType
}

function CommonNotification({ notification }: CommonNotificationProps) {
  const { t } = useTranslation()
  const { isLoading, isSuccess, error, runAsync } = useAsync<
    never,
    FetchError
  >()
  const { handleDismiss } = useAsyncDismiss()

  // 404 probably means the invite has already been accepted and deleted. Treat as success
  const accepted = isSuccess || error?.response?.status === 404

  function handleAcceptInvite(notification: NotificationProjectInvite) {
    const {
      messageOpts: { projectId, token },
    } = notification

    runAsync(
      postJSON(`/project/${projectId}/invite/token/${token}/accept`)
    ).catch(debugConsole.error)
  }

  const { _id: id, templateKey, html } = notification

  return (
    <>
      {templateKey === 'notification_project_invite' ? (
        <Notification
          type="info"
          onDismiss={() => id && handleDismiss(id)}
          content={
            accepted ? (
              <Trans
                i18nKey="notification_project_invite_accepted_message"
                components={{ b: <b /> }}
                values={{ projectName: notification.messageOpts.projectName }}
                shouldUnescape
                tOptions={{ interpolation: { escapeValue: true } }}
              />
            ) : (
              <Trans
                i18nKey="notification_project_invite_message"
                components={{ b: <b /> }}
                values={{
                  userName: notification.messageOpts.userName,
                  projectName: notification.messageOpts.projectName,
                }}
                shouldUnescape
                tOptions={{ interpolation: { escapeValue: true } }}
              />
            )
          }
          action={
            accepted ? (
              <OLButton
                variant="secondary"
                href={`/project/${notification.messageOpts.projectId}`}
              >
                {t('open_project')}
              </OLButton>
            ) : (
              <OLButton
                variant="secondary"
                isLoading={isLoading}
                loadingLabel={t('joining')}
                disabled={isLoading}
                onClick={() => handleAcceptInvite(notification)}
              >
                {t('join_project')}
              </OLButton>
            )
          }
        />
      ) : templateKey === 'notification_tpds_file_limit' ? (
        <Notification
          type="error"
          onDismiss={() => id && handleDismiss(id)}
          title={`${notification?.messageOpts?.projectName || 'A project'} exceeds the 2000 file limit`}
          content={
            <>
              You can't add more files to the project or sync it with any
              integrations until you reduce the number of files.
            </>
          }
          action={
            notification.messageOpts.projectId ? (
              <OLButton
                variant="secondary"
                onClick={() => id && handleDismiss(id)}
                href={`/project/${notification.messageOpts.projectId}`}
              >
                Open project
              </OLButton>
            ) : undefined
          }
        />
      ) : templateKey === 'notification_dropbox_duplicate_project_names' ? (
        <Notification
          type="warning"
          onDismiss={() => id && handleDismiss(id)}
          content={
            <>
              <p>
                <Trans
                  i18nKey="dropbox_duplicate_project_names"
                  components={[<b />]} // eslint-disable-line react/jsx-key
                  values={{ projectName: notification.messageOpts.projectName }}
                  shouldUnescape
                  tOptions={{ interpolation: { escapeValue: true } }}
                />
              </p>
              <p>
                <Trans
                  i18nKey="dropbox_duplicate_project_names_suggestion"
                  components={[<b />]} // eslint-disable-line react/jsx-key
                />{' '}
                <a
                  href="/learn/how-to/Dropbox_Synchronization#Troubleshooting"
                  target="_blank"
                >
                  {t('learn_more')}
                </a>
                .
              </p>
            </>
          }
        />
      ) : (
        <Notification
          type="info"
          onDismiss={() => id && handleDismiss(id)}
          content={html}
        />
      )}
    </>
  )
}

export default Common
