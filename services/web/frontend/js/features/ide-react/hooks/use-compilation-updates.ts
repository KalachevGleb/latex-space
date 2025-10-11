/**
 * Hook to subscribe to compilation updates via WebSocket
 */
import { useEffect } from 'react'
import { useConnectionContext } from '../context/connection-context'
import { debugConsole } from '@/utils/debugging'

type CompilationUpdateHandler = (update: CompilationUpdate) => void

export interface CompilationUpdate {
  type: 'compilation-complete' | 'compilation-error' | 'compilation-cancelled'
  userId: string
  configHash: string
  status?: 'success' | 'failure'
  outputFiles?: any[]
  buildId?: string
  stats?: any
  error?: string
  reason?: string
}

/**
 * Subscribe to compilation updates for the current project
 * 
 * @param handler - Function to call when compilation update is received
 */
export function useCompilationUpdates(handler: CompilationUpdateHandler) {
  const { socket } = useConnectionContext()

  useEffect(() => {
    if (!socket) {
      return
    }

    const handleCompilationUpdate = (update: CompilationUpdate) => {
      debugConsole.log('Received compilation update:', update)
      handler(update)
    }

    // Subscribe to compilationUpdate event
    socket.on('compilationUpdate', handleCompilationUpdate)

    return () => {
      // Cleanup subscription
      socket.off('compilationUpdate', handleCompilationUpdate)
    }
  }, [socket, handler])
}

