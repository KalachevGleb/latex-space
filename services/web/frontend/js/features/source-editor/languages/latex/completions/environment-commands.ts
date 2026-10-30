export type EnvironmentCommand = {
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
export const findEnvironmentCommands = (
  text: string,
  offset = 0
): EnvironmentCommand[] => {
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

  if (offset === 0) {
    return commands
  }
  return commands.map(command => ({
    ...command,
    commandFrom: command.commandFrom + offset,
    nameFrom: command.nameFrom + offset,
    nameTo: command.nameTo + offset,
  }))
}

/**
 * The `\end` that closes the given `\begin`, when each `\end{name}` closes
 * the innermost open `\begin{name}`
 */
const findClosingEnd = (
  commands: EnvironmentCommand[],
  begin: EnvironmentCommand
): EnvironmentCommand | null => {
  const open: EnvironmentCommand[] = []

  for (const command of commands) {
    if (command.cmd === 'begin') {
      open.push(command)
      continue
    }

    let index = open.length - 1
    while (index >= 0 && open[index].env !== command.env) {
      index--
    }
    if (index === -1) {
      continue
    }
    if (open[index] === begin) {
      return command
    }
    open.length = index
  }

  return null
}

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

/**
 * The `\end{name}` paired with the given `\begin{name}`, if it isn't needed
 * by an enclosing environment with the same name
 */
export const findPairedEnd = (
  commands: EnvironmentCommand[],
  begin: EnvironmentCommand
): EnvironmentCommand | null => {
  if (!begin.env) {
    return null
  }

  const end = findClosingEnd(commands, begin)
  if (!end) {
    return null
  }

  // A `\begin{itemize}` typed inside another itemize takes over its `\end`;
  // that pair leaves the enclosing `\begin` unmatched.
  const withoutBegin = commands.filter(command => command !== begin)
  const withoutPair = withoutBegin.filter(command => command !== end)

  return countUnmatchedCommands(withoutPair) <
    countUnmatchedCommands(withoutBegin)
    ? end
    : null
}
