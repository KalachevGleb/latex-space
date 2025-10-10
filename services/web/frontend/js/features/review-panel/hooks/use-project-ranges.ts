import { useCallback, useEffect, useState } from 'react'
import { Ranges } from '../context/ranges-context'
import { useProjectContext } from '@/shared/context/project-context'
import { getJSON } from '@/infrastructure/fetch-json'
import useSocketListener from '@/features/ide-react/hooks/use-socket-listener'
import { useConnectionContext } from '@/features/ide-react/context/connection-context'
import getMeta from '@/utils/meta'
import { buildProjectRangesFromSnapshot } from '@/features/review-panel/utils/snapshot-ranges'

export default function useProjectRanges() {
  const { projectId } = useProjectContext()
  const [error, setError] = useState<Error>()
  const [projectRanges, setProjectRanges] = useState<Map<string, Ranges>>()
  const [loading, setLoading] = useState(true)
  const { socket } = useConnectionContext()
  const otMigrationStage = getMeta('ol-otMigrationStage')
  const { projectSnapshot } = useProjectContext()

  useEffect(() => {
    if (otMigrationStage === 1) {
      projectSnapshot.refresh().then(() => {
        setProjectRanges(buildProjectRangesFromSnapshot(projectSnapshot))
        setLoading(false)
      })
    } else {
      setLoading(true)
      getJSON<{ id: string; ranges: Ranges }[]>(`/project/${projectId}/ranges`)
        .then(data => {
          setProjectRanges(
            new Map(
              data.map(item => [
                item.id,
                {
                  docId: item.id,
                  changes: item.ranges.changes ?? [],
                  comments: item.ranges.comments ?? [],
                },
              ])
            )
          )
        })
        .catch(error => setError(error))
        .finally(() => setLoading(false))
    }
  }, [projectId, otMigrationStage, projectSnapshot])

  useSocketListener(
    socket,
    'accept-changes',
    useCallback((docId: string, entryIds: string[]) => {
      setProjectRanges(prevProjectRanges => {
        if (!prevProjectRanges) {
          return prevProjectRanges
        }

        const ranges = prevProjectRanges.get(docId)
        if (!ranges) {
          return prevProjectRanges
        }
        const updatedProjectRanges = new Map(prevProjectRanges)

        updatedProjectRanges.set(docId, {
          ...ranges,
          changes: ranges.changes.filter(
            change => !entryIds.includes(change.id)
          ),
        })

        return updatedProjectRanges
      })
    }, [])
  )

  useSocketListener(
    socket,
    'new-comment',
    useCallback(() => {
      if (otMigrationStage === 1) {
        projectSnapshot.refresh().then(() => {
          setProjectRanges(buildProjectRangesFromSnapshot(projectSnapshot))
          setLoading(false)
        })
      }
    }, [otMigrationStage, projectSnapshot])
  )

  useSocketListener(
    socket,
    'resolve-thread',
    useCallback((threadId: string) => {
      setProjectRanges(prevProjectRanges => {
        if (!prevProjectRanges) {
          return prevProjectRanges
        }

        const updatedProjectRanges = new Map(prevProjectRanges)
        
        // Найти и обновить resolved статус комментария
        for (const [docId, ranges] of updatedProjectRanges.entries()) {
          const commentIndex = ranges.comments.findIndex(
            comment => comment.op.t === threadId
          )
          
          if (commentIndex !== -1) {
            const updatedComments = [...ranges.comments]
            updatedComments[commentIndex] = {
              ...updatedComments[commentIndex],
              resolved: true,
            }
            
            updatedProjectRanges.set(docId, {
              ...ranges,
              comments: updatedComments,
            })
            break
          }
        }

        return updatedProjectRanges
      })
    }, [])
  )

  useSocketListener(
    socket,
    'reopen-thread',
    useCallback((threadId: string) => {
      setProjectRanges(prevProjectRanges => {
        if (!prevProjectRanges) {
          return prevProjectRanges
        }

        const updatedProjectRanges = new Map(prevProjectRanges)
        
        // Найти и обновить resolved статус комментария
        for (const [docId, ranges] of updatedProjectRanges.entries()) {
          const commentIndex = ranges.comments.findIndex(
            comment => comment.op.t === threadId
          )
          
          if (commentIndex !== -1) {
            const updatedComments = [...ranges.comments]
            updatedComments[commentIndex] = {
              ...updatedComments[commentIndex],
              resolved: false,
            }
            
            updatedProjectRanges.set(docId, {
              ...ranges,
              comments: updatedComments,
            })
            break
          }
        }

        return updatedProjectRanges
      })
    }, [])
  )

  useSocketListener(
    socket,
    'delete-thread',
    useCallback((threadId: string) => {
      setProjectRanges(prevProjectRanges => {
        if (!prevProjectRanges) {
          return prevProjectRanges
        }

        const updatedProjectRanges = new Map(prevProjectRanges)
        
        // Найти и удалить комментарий
        for (const [docId, ranges] of updatedProjectRanges.entries()) {
          const updatedComments = ranges.comments.filter(
            comment => comment.op.t !== threadId
          )
          
          if (updatedComments.length !== ranges.comments.length) {
            updatedProjectRanges.set(docId, {
              ...ranges,
              comments: updatedComments,
            })
            break
          }
        }

        return updatedProjectRanges
      })
    }, [])
  )

  return { projectRanges, error, loading }
}
