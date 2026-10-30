import { useCallback, useEffect } from 'react'
import useEventListener from '../../../shared/hooks/use-event-listener'
import useDetachAction from '../../../shared/hooks/use-detach-action'

// "s", also with Caps Lock on, or the physical S key in layouts without Latin
// letters (e.g. Russian), where `key` is the local letter
const isKeyS = (event: KeyboardEvent | React.KeyboardEvent<Element>) =>
  event.key === 's' ||
  event.key === 'S' ||
  (event.code === 'KeyS' && !/^[a-zA-Z]$/.test(event.key))

export const startCompileKeypress = (
  event: KeyboardEvent | React.KeyboardEvent<Element>
) => {
  if (event.shiftKey || event.altKey) {
    return false
  }

  if (event.ctrlKey) {
    // Ctrl+s / Ctrl+Enter / Ctrl+.
    if (isKeyS(event) || event.key === 'Enter' || event.key === '.') {
      return true
    }
  } else if (event.metaKey) {
    // Cmd+s / Cmd+Enter
    if (isKeyS(event) || event.key === 'Enter') {
      return true
    }
  }
}

export default function useCompileTriggers(
  startCompile: (...args: any[]) => void,
  setChangedAt: (...args: any[]) => void
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (startCompileKeypress(event)) {
        event.preventDefault()
        startCompile()
      }
    },
    [startCompile]
  )

  const handleStartCompile = useCallback(() => {
    startCompile()
  }, [startCompile])
  useEventListener('pdf:recompile', handleStartCompile)

  useEffect(() => {
    document.body.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  // record doc changes when notified by the editor
  const setOrTriggerChangedAt = useDetachAction(
    'set-changed-at',
    setChangedAt,
    'detacher',
    'detached'
  )
  const setChangedAtHandler = useCallback(() => {
    setOrTriggerChangedAt(Date.now())
  }, [setOrTriggerChangedAt])
  useEventListener('doc:changed', setChangedAtHandler)
}
