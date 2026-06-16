import { Ranges } from '../context/ranges-context'

type DocForRanges = {
  doc: { id: string; name?: string }
  path: string
}

/**
 * Resolve the ranges to display for every document shown in the Overview tab.
 *
 * For the currently-open document we use its live ranges (`docRanges`), which
 * may contain comments/changes not yet flushed to the project-wide snapshot.
 * For every other document we look the ranges up in `projectRanges`, which is
 * keyed by path under history-OT (otMigrationStage === 1) and by doc id
 * otherwise.
 *
 * This is the logic that decides whether the Overview shows comments from ALL
 * files or only the current one: if a non-current document is missing from
 * `projectRanges`, it simply won't appear here.
 */
export const buildRangesForDocs = (
  docs: DocForRanges[] | undefined,
  docRanges: Ranges | undefined,
  projectRanges: Map<string, Ranges> | undefined,
  otMigrationStage: number | undefined
): Map<string, Ranges> | undefined => {
  if (!docs || !docRanges || !projectRanges) {
    return undefined
  }

  const rangesForDocs = new Map<string, Ranges>()

  for (const doc of docs) {
    const ranges =
      doc.doc.id === docRanges.docId
        ? docRanges
        : projectRanges.get(otMigrationStage === 1 ? doc.path : doc.doc.id)

    if (ranges) {
      rangesForDocs.set(doc.doc.id, ranges)
    }
  }

  return rangesForDocs
}
