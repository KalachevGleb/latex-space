import { renderInReactLayout } from '@/react'
import useWaitForI18n from '@/shared/hooks/use-wait-for-i18n'

import UserActivateRegister from '../components/user-activate-register'

function UserActivateRegisterRoot() {
  const { isReady } = useWaitForI18n()

  if (!isReady) {
    return null
  }

  return <UserActivateRegister />
}

renderInReactLayout('user-activate-register-container', () => (
  <UserActivateRegisterRoot />
))
