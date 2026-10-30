import { environments, snippet } from './data/environments'
import { applySnippet, extendOverUnpairedClosingBrace } from './apply'
import {
  Completion,
  CompletionContext,
  pickedCompletion,
} from '@codemirror/autocomplete'
import { Completions } from './types'
import { EditorView } from '@codemirror/view'

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

type EnvironmentCommand = {
  cmd: 'begin' | 'end'
  env: string
  commandFrom: number
  nameFrom: number
  nameTo: number
}

const verbatimEnvironments = new Set([
  'verbatim',
  'verbatim*',
  'boxedverbatim',
  'Verbatim',
  'lstlisting',
  'minted',
  'tcblisting',
  'codeexample',
  'comment',
])

const isAsciiLetter = (char: string): boolean => {
  if (!char) {
    return false
  }
  const code = char.charCodeAt(0)
  return (
    (code >= 'A'.charCodeAt(0) && code <= 'Z'.charCodeAt(0)) ||
    (code >= 'a'.charCodeAt(0) && code <= 'z'.charCodeAt(0))
  )
}

const readEnvironmentCommand = (
  text: string,
  commandFrom: number,
  commandTo: number,
  cmd: 'begin' | 'end'
): EnvironmentCommand | null => {
  let cursor = commandTo
  while (
    text[cursor] === ' ' ||
    text[cursor] === '\t' ||
    text[cursor] === '\n'
  ) {
    cursor++
  }
  if (text[cursor] !== '{') {
    return null
  }

  const nameFrom = cursor + 1
  let nameTo = nameFrom
  while (nameTo < text.length && text[nameTo] !== '}') {
    if (/[{\\%\n]/.test(text[nameTo])) {
      return null
    }
    nameTo++
  }
  if (nameTo >= text.length) {
    return null
  }

  return {
    cmd,
    env: text.slice(nameFrom, nameTo),
    commandFrom,
    nameFrom,
    nameTo,
  }
}

/**
 * All complete `\begin{…}` and `\end{…}` commands in the text,
 * except those in comments, `\verb` and verbatim environments
 */
const findEnvironmentCommands = (text: string): EnvironmentCommand[] => {
  const commands: EnvironmentCommand[] = []

  let i = 0
  while (i < text.length) {
    if (text[i] === '%') {
      const lineEnd = text.indexOf('\n', i)
      if (lineEnd === -1) {
        break
      }
      i = lineEnd + 1
      continue
    }

    if (text[i] !== '\\') {
      i++
      continue
    }

    let commandTo = i + 1
    while (commandTo < text.length && isAsciiLetter(text[commandTo])) {
      commandTo++
    }
    const commandName = text.slice(i + 1, commandTo)

    if (commandName === '') {
      // control symbol, e.g. `\\` or `\%`
      i += 2
      continue
    }

    if (commandName === 'verb') {
      const delimiterPos = text[commandTo] === '*' ? commandTo + 1 : commandTo
      const delimiter = text[delimiterPos]
      const closePos = delimiter
        ? text.indexOf(delimiter, delimiterPos + 1)
        : -1
      const lineEnd = text.indexOf('\n', delimiterPos)
      i =
        delimiter !== '\n' &&
        closePos !== -1 &&
        (lineEnd === -1 || closePos < lineEnd)
          ? closePos + 1
          : commandTo
      continue
    }

    if (commandName !== 'begin' && commandName !== 'end') {
      i = commandTo
      continue
    }

    const command = readEnvironmentCommand(text, i, commandTo, commandName)
    if (!command) {
      i = commandTo
      continue
    }
    commands.push(command)
    i = command.nameTo + 1

    if (command.cmd === 'begin' && verbatimEnvironments.has(command.env)) {
      const endCommand = `\\end{${command.env}}`
      const endFrom = text.indexOf(endCommand, i)
      if (endFrom === -1) {
        break
      }
      const nameFrom = endFrom + '\\end{'.length
      commands.push({
        cmd: 'end',
        env: command.env,
        commandFrom: endFrom,
        nameFrom,
        nameTo: nameFrom + command.env.length,
      })
      i = endFrom + endCommand.length
    }
  }

  return commands
}

/**
 * The number of commands left without a pair when each `\end{name}` closes
 * the innermost open `\begin{name}`
 */
const countUnmatchedCommands = (commands: EnvironmentCommand[]): number => {
  const open: string[] = []
  let unmatched = 0

  for (const command of commands) {
    if (command.cmd === 'begin') {
      open.push(command.env)
      continue
    }

    const index = open.lastIndexOf(command.env)
    if (index === -1) {
      unmatched++
    } else {
      unmatched += open.length - 1 - index
      open.length = index
    }
  }

  return unmatched + open.length
}

const findPairedEnd = (
  commands: EnvironmentCommand[],
  begin: EnvironmentCommand
): EnvironmentCommand | null => {
  const open: string[] = []
  let candidate: EnvironmentCommand | null = null

  for (const command of commands.slice(commands.indexOf(begin) + 1)) {
    if (command.cmd === 'begin') {
      open.push(command.env)
    } else if (open.length === 0) {
      candidate = command
      break
    } else {
      const index = open.lastIndexOf(command.env)
      if (index !== -1) {
        open.length = index
      }
    }
  }

  if (!candidate) {
    return null
  }

  // The first `\end` on the same level may close an enclosing environment
  // (e.g. `\end{document}` after a newly typed `\begin`). It belongs to the
  // edited `\begin` only if removing both leaves fewer unmatched commands
  // than removing the `\begin` alone.
  const withoutBegin = commands.filter(command => command !== begin)
  const withoutPair = withoutBegin.filter(command => command !== candidate)

  return countUnmatchedCommands(withoutPair) <
    countUnmatchedCommands(withoutBegin)
    ? candidate
    : null
}

const tryRenameEnvironment = (
  view: EditorView,
  completion: Completion,
  name: string,
  from: number,
  to: number
): boolean => {
  const commands = findEnvironmentCommands(view.state.doc.toString())

  const begin = commands.find(
    command =>
      command.cmd === 'begin' &&
      command.commandFrom >= from &&
      command.nameFrom <= to &&
      to <= command.nameTo + 1
  )
  if (!begin) {
    return false
  }

  const end = findPairedEnd(commands, begin)
  if (!end) {
    return false
  }

  view.dispatch({
    changes: [
      { from: begin.nameFrom, to: begin.nameTo, insert: name },
      { from: end.nameFrom, to: end.nameTo, insert: name },
    ],
    selection: { anchor: begin.nameFrom + name.length + 1 },
    annotations: pickedCompletion.of(completion),
    userEvent: 'input.complete',
  })
  return true
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
    if (tryRenameEnvironment(view, completion, name, from, to)) {
      return
    }
    applyDefaultSnippet(view, completion, from, to)
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
