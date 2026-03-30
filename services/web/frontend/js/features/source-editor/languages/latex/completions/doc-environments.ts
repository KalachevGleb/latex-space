import { customBeginCompletion } from './environments'
import { CompletionContext } from '@codemirror/autocomplete'
import { documentEnvironments } from '../document-environments'
import { ProjectionResult } from '../../../utils/tree-operations/projection'
import { Environment } from '../../../utils/tree-operations/environments'
import { metadataState } from '../../../extensions/language'

/**
 * Environments from the current doc
 */
export function customEnvironmentCompletions(context: CompletionContext) {
  const items = findEnvironments(context)

  const completions = []

  for (const env of items.values()) {
    const completion = customBeginCompletion(env)
    if (completion) {
      completions.push(completion)
    }
  }

  return completions
}

const isPublicEnvironmentName = (name: string) => !name.includes('@')

export const findEnvironments = (context: CompletionContext) => {
  const result = new Set<string>()

  const metadata = context.state.field(metadataState, false)
  if (metadata?.environments) {
    for (const environment of metadata.environments) {
      if (isPublicEnvironmentName(environment)) {
        result.add(environment)
      }
    }
  }

  const environmentNamesProjection: ProjectionResult<Environment> =
    context.state.field(documentEnvironments)
  if (!environmentNamesProjection || !environmentNamesProjection.items) {
    return result
  }

  for (const environment of environmentNamesProjection.items) {
    // include the environment name if it's outside the current context
    if (
      (environment.to < context.pos || environment.from > context.pos) &&
      isPublicEnvironmentName(environment.title)
    ) {
      result.add(environment.title)
    }
  }

  return result
}

// Backward-compatible export used by complete.ts
export const findEnvironmentsInDoc = findEnvironments
