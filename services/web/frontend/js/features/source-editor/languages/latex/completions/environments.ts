import { environments, snippet } from './data/environments'
import { applySnippet, extendOverUnpairedClosingBrace } from './apply'
import { Completion, CompletionContext } from '@codemirror/autocomplete'
import { Completions } from './types'
import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { SyntaxNode } from '@lezer/common'
import { getRememberedEnvironmentPair } from './remember-environment-pair'

/**
 * Environments from bundled data
 */
export function buildEnvironmentCompletions(completions: Completions) {
  for (const [item, snippet] of environments) {
    // clear snippet for some environments after inserting
    const clear =
      item === 'abstract' || item === 'itemize' || item === 'enumerate'
    completions.commands.push({
      type: 'env',
      label: `\\begin{${item}} …`,
      apply: applyBeginCompletion(item, clear),
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

const iterateEnvironmentCommandsInText = function* (
  text: string,
  textOffset: number
): Generator<EnvironmentCommand> {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') {
      continue
    }

    let cursor = i + 1
    while (cursor < text.length && isAsciiLetter(text[cursor])) {
      cursor++
    }

    const commandName = text.slice(i + 1, cursor)
    if (commandName !== 'begin' && commandName !== 'end') {
      continue
    }

    while (cursor < text.length) {
      const char = text[cursor]
      if (char === ' ' || char === '\t' || char === '\n') {
        cursor++
        continue
      }
      break
    }

    if (text[cursor] !== '{') {
      continue
    }

    const nameStart = cursor + 1
    let nameEnd = nameStart
    while (nameEnd < text.length && text[nameEnd] !== '}') {
      nameEnd++
    }
    if (nameEnd >= text.length) {
      continue
    }

    yield {
      cmd: commandName,
      env: text.slice(nameStart, nameEnd),
      commandFrom: textOffset + i,
      nameFrom: textOffset + nameStart,
      nameTo: textOffset + nameEnd,
    }

    i = nameEnd
  }
}

const getEnvNameNode = (node: SyntaxNode | null): SyntaxNode | null => {
  const nameNode = node?.getChild('EnvNameGroup')?.getChild('OpenBrace')
    ?.nextSibling
  if (!nameNode || nameNode.type.is('CloseBrace')) {
    return null
  }
  return nameNode
}

const findAncestorNodeWithType = (
  node: SyntaxNode | null,
  type: string
): SyntaxNode | null => {
  while (node) {
    if (node.type.is(type)) {
      return node
    }
    node = node.parent
  }
  return null
}

const findBeginEnvNode = (
  view: EditorView,
  from: number,
  to: number
): SyntaxNode | null => {
  const { state } = view
  const tree = syntaxTree(state)
  const positions = Array.from(
    new Set([
      state.selection.main.head,
      from,
      to,
      from + 1,
      to - 1,
    ])
  ).filter(pos => pos >= 0 && pos <= state.doc.length)

  for (const pos of positions) {
    for (const bias of [-1, 1] as const) {
      const resolvedNode = tree.resolveInner(pos, bias)
      const beginEnv =
        findAncestorNodeWithType(resolvedNode, 'BeginEnv') ??
        findAncestorNodeWithType(resolvedNode, '$Environment')?.getChild(
          'BeginEnv'
        )

      if (beginEnv?.type.is('BeginEnv')) {
        return beginEnv
      }
    }
  }

  return null
}

const findBeginNameByText = (
  view: EditorView,
  from: number,
  to: number
): { from: number; to: number; beginCommandFrom: number } | null => {
  const { state } = view
  const line = state.doc.lineAt(from)
  const cursorPos = state.selection.main.head
  for (const command of iterateEnvironmentCommandsInText(line.text, line.from)) {
    if (command.cmd !== 'begin') {
      continue
    }

    const nameFrom = command.nameFrom
    const nameTo = command.nameTo
    const intersects =
      (from >= nameFrom && from <= nameTo) ||
      (to >= nameFrom && to <= nameTo) ||
      (cursorPos >= nameFrom && cursorPos <= nameTo)

    if (intersects) {
      return {
        from: nameFrom,
        to: nameTo,
        beginCommandFrom: command.commandFrom,
      }
    }
  }

  return null
}

const findEndNameRangeByStructure = (
  view: EditorView,
  beginCommandFrom: number
): { from: number; to: number } | null => {
  const docTail = view.state.doc.sliceString(beginCommandFrom)
  let hasSeenTargetBegin = false
  let depth = 0

  for (const command of iterateEnvironmentCommandsInText(docTail, beginCommandFrom)) {
    if (!hasSeenTargetBegin) {
      if (command.cmd === 'begin') {
        hasSeenTargetBegin = true
      }
      continue
    }

    if (command.cmd === 'begin') {
      depth++
      continue
    }

    if (depth === 0) {
      return {
        from: command.nameFrom,
        to: command.nameTo,
      }
    }

    depth--
  }

  return null
}

const tryRenameCurrentEnvironment = (
  view: EditorView,
  name: string,
  from: number,
  to: number
): boolean => {
  const remembered = getRememberedEnvironmentPair(view)
  const cursorPos = view.state.selection.main.head
  if (
    remembered &&
    cursorPos >= remembered.beginNameFrom - 1 &&
    cursorPos <= remembered.beginNameTo + 1
  ) {
    view.dispatch({
      changes: [
        {
          from: remembered.beginNameFrom,
          to: remembered.beginNameTo,
          insert: name,
        },
        {
          from: remembered.endNameFrom,
          to: remembered.endNameTo,
          insert: name,
        },
      ],
    })
    return true
  }

  const beginEnvNode = findBeginEnvNode(view, from, to)
  if (beginEnvNode) {
    const beginEnvNameNode = getEnvNameNode(beginEnvNode)
    if (!beginEnvNameNode) {
      return false
    }

    const environmentNode = beginEnvNode.parent
    const endEnvNameNode = getEnvNameNode(
      environmentNode?.getChild('EndEnv') ?? null
    )
    if (!endEnvNameNode) {
      // Let fallback handle malformed trees or fall through to snippet insertion.
      // This preserves auto-insert of \end{...} for brand-new \begin{...}.
      return false
    }

    const changes: { from: number; to: number; insert: string }[] = [
      {
        from: beginEnvNameNode.from,
        to: beginEnvNameNode.to,
        insert: name,
      },
      {
        from: endEnvNameNode.from,
        to: endEnvNameNode.to,
        insert: name,
      },
    ]

    view.dispatch({ changes })
    return true
  }

  // Fallback for temporarily malformed syntax trees (e.g. after Delete in \begin{...})
  const beginNameRange = findBeginNameByText(view, from, to)
  if (!beginNameRange) {
    return false
  }

  const changes: { from: number; to: number; insert: string }[] = [
    {
      from: beginNameRange.from,
      to: beginNameRange.to,
      insert: name,
    },
  ]

  const endNameRange = findEndNameRangeByStructure(
    view,
    beginNameRange.beginCommandFrom
  )
  if (endNameRange) {
    changes.push({
      from: endNameRange.from,
      to: endNameRange.to,
      insert: name,
    })
  }

  view.dispatch({ changes })
  return true
}

export const applyBeginCompletion = (name: string, clear = false) => {
  const applyDefaultSnippet = applySnippet(snippet(name), clear)

  return (
    view: EditorView,
    completion: Completion,
    from: number,
    to: number
  ) => {
    if (tryRenameCurrentEnvironment(view, name, from, to)) {
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

  for (const command of iterateEnvironmentCommandsInText(text, 0)) {
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
