/**
 * Минимальный glob-матчер для списков игнорирования.
 * Поддерживает **, *, ? и сегменты путей через /.
 */
export class IgnoreMatcher {
  private regexes: RegExp[]
  private pruneDirs: RegExp[]

  constructor(patterns: string[]) {
    this.regexes = patterns.map(p => globToRegExp(p))
    // Для шаблонов вида "dir/**" каталог dir можно отсекать целиком при обходе
    this.pruneDirs = patterns
      .filter(p => p.endsWith('/**'))
      .map(p => globToRegExp(p.slice(0, -3)))
  }

  ignoresFile(relPath: string): boolean {
    return this.regexes.some(r => r.test(relPath))
  }

  ignoresDir(relPath: string): boolean {
    return this.pruneDirs.some(r => r.test(relPath))
  }
}

export function globToRegExp(pattern: string): RegExp {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // "**/" -> ноль и более сегментов; "**" -> всё
        if (pattern[i + 2] === '/') {
          re += '(?:[^/]+/)*'
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        re += '[^/]*'
        i += 1
      }
    } else if (c === '?') {
      re += '[^/]'
      i += 1
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  return new RegExp('^' + re + '$')
}
