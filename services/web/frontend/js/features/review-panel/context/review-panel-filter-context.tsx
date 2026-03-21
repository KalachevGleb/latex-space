import {
  createContext,
  FC,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

export type FilterMode = 'comments' | 'changes' | 'both'

type FilterState = {
  filterMode: FilterMode
  hideMine: boolean
}

type FilterActions = {
  setFilterMode: (mode: FilterMode) => void
  toggleHideMine: () => void
}

const ReviewPanelFilterContext = createContext<FilterState>({
  filterMode: 'comments',
  hideMine: false,
})

const ReviewPanelFilterActionsContext = createContext<
  FilterActions | undefined
>(undefined)

export const ReviewPanelFilterProvider: FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('comments')
  const [hideMine, setHideMine] = useState(false)

  const toggleHideMine = useCallback(() => {
    setHideMine(prev => !prev)
  }, [])

  const state = useMemo(
    () => ({ filterMode, hideMine }),
    [filterMode, hideMine]
  )

  const actions = useMemo(
    () => ({ setFilterMode, toggleHideMine }),
    [toggleHideMine]
  )

  return (
    <ReviewPanelFilterActionsContext.Provider value={actions}>
      <ReviewPanelFilterContext.Provider value={state}>
        {children}
      </ReviewPanelFilterContext.Provider>
    </ReviewPanelFilterActionsContext.Provider>
  )
}

export const useReviewPanelFilterContext = () => {
  return useContext(ReviewPanelFilterContext)
}

export const useReviewPanelFilterActionsContext = () => {
  const context = useContext(ReviewPanelFilterActionsContext)
  if (!context) {
    throw new Error(
      'useReviewPanelFilterActionsContext is only available inside ReviewPanelFilterProvider'
    )
  }
  return context
}
