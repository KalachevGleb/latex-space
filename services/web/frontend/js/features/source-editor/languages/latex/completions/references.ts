/**
 * `cite` completions based on reference keys in the project
 */
import { CompletionContext } from '@codemirror/autocomplete'
import { Completions } from './types'
import { metadataState } from '../../../extensions/language'
import { extendRequiredParameter } from './apply'
import { maybeGetSectionForOption } from './sections'
import { documentBibitems } from '../document-bibitems'

export function buildReferenceCompletions(
  completions: Completions,
  context: CompletionContext
) {
  const metadata = context.state.field(metadataState, false)

  if (!metadata) {
    return
  }

  for (const referenceKey of metadata.referenceKeys) {
    completions.references.push({
      type: 'reference',
      label: referenceKey,
      extend: extendRequiredParameter,
      section: maybeGetSectionForOption(context, 'references'),
      deduplicate: {
        key: referenceKey,
        priority: 1,
      },
    })
  }

  // Add bibitems from backend metadata (across all project documents)
  if (metadata.bibitems) {
    for (const bibitem of metadata.bibitems) {
      completions.references.push({
        type: 'reference',
        label: bibitem,
        extend: extendRequiredParameter,
        section: maybeGetSectionForOption(context, 'references'),
        deduplicate: {
          key: bibitem,
          priority: 2, // Higher priority than .bib entries
        },
      })
    }
  }

  // Add bibitems from current document (real-time parsing via syntax tree)
  const bibitemsProjection = context.state.field(documentBibitems, false)
  if (bibitemsProjection?.items) {
    // Deduplicate by key - keep only the last occurrence of each key
    const uniqueBibitems = new Map<string, typeof bibitemsProjection.items[0]>()
    for (const bibitem of bibitemsProjection.items) {
      uniqueBibitems.set(bibitem.key, bibitem)
    }

    for (const bibitem of uniqueBibitems.values()) {
      completions.references.push({
        type: 'reference',
        label: bibitem.key,
        extend: extendRequiredParameter,
        section: maybeGetSectionForOption(context, 'references'),
        deduplicate: {
          key: bibitem.key,
          priority: 3, // Highest priority for current document bibitems
        },
      })
    }
  }
}
