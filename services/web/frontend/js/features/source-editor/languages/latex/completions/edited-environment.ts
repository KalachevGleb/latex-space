import {
  ChangeDesc,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state'
import {
  EnvironmentCommand,
  findEnvironmentCommands,
  findPairedEnd,
} from './environment-commands'

type NameRange = { from: number; to: number }

/**
 * The name of a `\begin{…}` being edited, and the `\end` that was paired with
 * it before the edit started
 */
export type EditedEnvironment = {
  name: string
  begin: NameRange
  end: NameRange | null
}

export const stopEditingEnvironment = StateEffect.define<null>()

const mapRange = (range: NameRange, changes: ChangeDesc): NameRange => ({
  from: changes.mapPos(range.from, -1),
  to: changes.mapPos(range.to, 1),
})

const mapEditedEnvironment = (
  value: EditedEnvironment,
  changes: ChangeDesc
): EditedEnvironment => ({
  name: value.name,
  begin: mapRange(value.begin, changes),
  end: value.end && mapRange(value.end, changes),
})

const changedRange = (tr: Transaction): NameRange => {
  let from = tr.startState.doc.length
  let to = 0
  tr.changes.iterChangedRanges((fromA, toA) => {
    from = Math.min(from, fromA)
    to = Math.max(to, toA)
  })
  return { from, to }
}

const startEditing = (
  tr: Transaction,
  changed: NameRange
): EditedEnvironment | null => {
  const { startState } = tr
  const head = startState.selection.main.head
  const line = startState.doc.lineAt(changed.from)
  if (changed.to > line.to) {
    return null
  }

  const begin = findEnvironmentCommands(line.text, line.from).find(
    command =>
      command.cmd === 'begin' &&
      command.nameFrom <= Math.min(changed.from, head) &&
      Math.max(changed.to, head) <= command.nameTo
  )
  if (!begin) {
    return null
  }

  let end: EnvironmentCommand | null = null
  // an empty name means a new `\begin{}`, e.g. with auto-closed braces
  if (begin.env) {
    const commands = findEnvironmentCommands(startState.doc.toString())
    const beginInDoc = commands.find(
      command => command.cmd === 'begin' && command.nameFrom === begin.nameFrom
    )
    end = beginInDoc ? findPairedEnd(commands, beginInDoc) : null
  }

  return {
    name: begin.env,
    begin: mapRange({ from: begin.nameFrom, to: begin.nameTo }, tr.changes),
    end: end
      ? mapRange({ from: end.nameFrom, to: end.nameTo }, tr.changes)
      : null,
  }
}

/**
 * Tracks the `\begin{…}` whose name is being edited, from the first change
 * inside its braces until the cursor leaves them
 */
export const editedEnvironment = StateField.define<EditedEnvironment | null>({
  create() {
    return null
  },
  update(value, tr) {
    if (tr.effects.some(effect => effect.is(stopEditingEnvironment))) {
      return null
    }

    if (tr.docChanged) {
      const changed = changedRange(tr)
      value =
        value &&
        value.begin.from <= changed.from &&
        changed.to <= value.begin.to
          ? mapEditedEnvironment(value, tr.changes)
          : (startEditing(tr, changed) ??
            (value && mapEditedEnvironment(value, tr.changes)))
    }

    const head = tr.state.selection.main.head
    return value && value.begin.from <= head && head <= value.begin.to + 1
      ? value
      : null
  },
})
