import { environments, snippet } from './data/environments'
import { applySnippet, extendOverUnpairedClosingBrace } from './apply'
import {
  Completion,
  CompletionContext,
  pickedCompletion,
} from '@codemirror/autocomplete'
import { Completions } from './types'
import { EditorView } from '@codemirror/view'
import {
  EnvironmentCommand,
  findEnvironmentCommands,
  findPairedEnd,
} from './environment-commands'
import { editedEnvironment, stopEditingEnvironment } from './edited-environment'

/**
 * Environments from bundled data
 */
export function buildEnvironmentCompletions(completions: Completions) {
  for (const [item, template] of environments) {
    // clear snippet for some environments after inserting
    const clear =
      item === 'abstract' || item === 'itemize' || item === 'enumerate'
    completions.commands.push({
      type: 'env',
      label: `\\begin{${item}} …`,
      apply: applyBeginCompletion(item, clear, template),
      extend: extendOverUnpairedClosingBrace,
    })
  }
}

/**
 * A `begin` environment completion with a snippet, for the current context
 */
export function customBeginCompletion(name: string): Completion | null {
  if (environments.has(name)) {
    return null
  }

  return {
    label: `\\begin{${name}} …`,
    apply: applyBeginCompletion(name),
    extend: extendOverUnpairedClosingBrace,
  }
}

/**
 * The `\begin` whose name the completion replaces, and its paired `\end`:
 * the one paired before the user started editing the name, or the current
 * one if the name hasn't been edited yet
 */
const findEnvironmentToRename = (
  view: EditorView,
  from: number,
  to: number
): { begin: EnvironmentCommand; end: EnvironmentCommand } | null => {
  const edited = view.state.field(editedEnvironment, false)
  if (edited && !edited.end) {
    return null
  }

  const commands = findEnvironmentCommands(view.state.doc.toString())

  if (edited?.end) {
    const editedEnd = edited.end
    const begin = commands.find(
      command =>
        command.cmd === 'begin' &&
        command.commandFrom >= from &&
        command.nameFrom === edited.begin.from &&
        command.nameTo === edited.begin.to
    )
    const end = commands.find(
      command =>
        command.cmd === 'end' &&
        command.env === edited.name &&
        command.nameFrom === editedEnd.from &&
        command.nameTo === editedEnd.to
    )
    return begin && end ? { begin, end } : null
  }

  const begin = commands.find(
    command =>
      command.cmd === 'begin' &&
      command.commandFrom >= from &&
      command.nameFrom <= to &&
      to <= command.nameTo
  )
  const end = begin && findPairedEnd(commands, begin)
  return begin && end ? { begin, end } : null
}

export const applyBeginCompletion = (
  name: string,
  clear = false,
  template = snippet(name)
) => {
  const applyDefaultSnippet = applySnippet(template, clear)

  return (
    view: EditorView,
    completion: Completion,
    from: number,
    to: number
  ) => {
    const environment = findEnvironmentToRename(view, from, to)
    if (!environment) {
      applyDefaultSnippet(view, completion, from, to)
      return
    }

    const { begin, end } = environment
    view.dispatch({
      changes: [
        { from: begin.nameFrom, to: begin.nameTo, insert: name },
        { from: end.nameFrom, to: end.nameTo, insert: name },
      ],
      selection: { anchor: begin.nameFrom + name.length + 1 },
      effects: stopEditingEnvironment.of(null),
      annotations: pickedCompletion.of(completion),
      userEvent: 'input.complete',
    })
  }
}

/**
 * `end` completions for open environments in the current doc, up to the current context
 * @return {*[]}
 */
export function customEndCompletions(context: CompletionContext): Completion[] {
  const openEnvironments = new Set<string>()
  const text = context.state.doc.sliceString(0, context.pos)

  for (const command of findEnvironmentCommands(text)) {
    if (command.cmd === 'begin') {
      openEnvironments.add(command.env)
    } else {
      openEnvironments.delete(command.env)
    }
  }

  const completions: Completion[] = []

  let boost = 10
  for (const env of openEnvironments) {
    completions.push({
      label: env,
      boost: boost++, // environments opened later rank higher
    })
  }

  return completions
}
