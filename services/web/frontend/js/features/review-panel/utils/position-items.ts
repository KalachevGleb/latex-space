import { debounce } from 'lodash'

export const OFFSET_FOR_ENTRIES_ABOVE = 70
const COLLAPSED_HEADER_HEIGHT = 42
const GAP_BETWEEN_ENTRIES = 4

export const positionItems = debounce(
  (
    element: HTMLDivElement,
    previousFocusedItemIndex: number | undefined,
    docId: string,
    newEditor: boolean
  ) => {
    const items = Array.from(
      element.querySelectorAll<HTMLDivElement>('.review-panel-entry')
    )

    items.sort((a, b) => Number(a.dataset.pos) - Number(b.dataset.pos))

    if (!items.length) {
      return
    }

    let activeItemIndex = items.findIndex(item =>
      item.classList.contains('review-panel-entry-selected')
    )

    if (activeItemIndex === -1) {
      // if entry was not selected manually
      // check if there is an entry in selection and use that as the focused item
      activeItemIndex = items.findIndex(item =>
        item.classList.contains('review-panel-entry-highlighted')
      )
    }

    if (activeItemIndex === -1) {
      activeItemIndex = previousFocusedItemIndex || 0
    }

    const activeItem = items[activeItemIndex]
    if (!activeItem) {
      return
    }

    const headerHeight = getHeaderHeight(element, newEditor)

    const activeItemTop = getTopPosition(
      activeItem,
      activeItemIndex === 0,
      headerHeight
    )

    const positions: [HTMLElement, number][] = []
    positions.push([activeItem, activeItemTop])

    // above the active item
    let topLimit = activeItemTop
    for (let i = activeItemIndex - 1; i >= 0; i--) {
      const item = items[i]
      const height = item.offsetHeight
      let top = getTopPosition(item, i === 0, headerHeight)
      const bottom = top + height
      if (bottom > topLimit) {
        top = topLimit - height - GAP_BETWEEN_ENTRIES
      }
      positions.push([item, top])
      topLimit = top
    }

    // below the active item
    let bottomLimit = activeItemTop + activeItem.offsetHeight
    for (let i = activeItemIndex + 1; i < items.length; i++) {
      const item = items[i]
      const height = item.offsetHeight
      let top = getTopPosition(item, false, headerHeight)
      if (top < bottomLimit) {
        top = bottomLimit + GAP_BETWEEN_ENTRIES
      }
      positions.push([item, top])
      bottomLimit = top + height
    }

    // Entries stacked above the active one can end up under the sticky panel
    // header (or above the panel altogether) when the ranges are close to the
    // top of the document. Shift the whole stack down so that the topmost
    // entry starts below the header.
    const minTop = headerHeight + GAP_BETWEEN_ENTRIES
    const topmost = Math.min(...positions.map(([, top]) => top))
    const shift = topmost < minTop ? minTop - topmost : 0

    for (const [item, top] of positions) {
      item.style.top = `${top + shift}px`
      item.style.visibility = 'visible'
    }

    return {
      docId,
      activeItemIndex,
    }
  },
  100,
  { leading: false, trailing: true, maxWait: 1000 }
)

/**
 * Height of the sticky header at the top of the panel, which entries must not
 * be placed under. The new editor renders the title in the rail and the panel
 * entries start at the top, hence 0.
 */
function getHeaderHeight(element: HTMLDivElement, newEditor: boolean) {
  if (newEditor) {
    return 0
  }
  const header = element
    .closest('.review-panel-inner')
    ?.querySelector<HTMLElement>('.review-panel-header')
  return header?.offsetHeight || COLLAPSED_HEADER_HEIGHT
}

function getTopPosition(
  item: HTMLDivElement,
  isFirstEntry: boolean,
  headerHeight: number
) {
  const offset = isFirstEntry ? 0 : OFFSET_FOR_ENTRIES_ABOVE

  return Math.max(headerHeight + offset, Number(item.dataset.top))
}
