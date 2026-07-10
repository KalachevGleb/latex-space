/**
 * «Разворачивание» LaTeX-исходника для точного SyncTeX.
 *
 * SyncTeX работает построчно, поэтому длинные абзацы синхронизируются
 * грубо. Идея: в безопасных местах заменить пробелы между словами на
 * переносы строк (для TeX одиночный перенос эквивалентен пробелу) —
 * тогда каждая «строка» становится маленькой и синхронизация точной.
 * Компиляция идёт по преобразованной теневой копии, а все позиции
 * (SyncTeX в обе стороны, ошибки из лога) пересчитываются через
 * двусторонний маппинг.
 *
 * Безопасные места — «глобальная область»: вне групп {…}, вне математики
 * ($…$, $$…$$, \(…\), \[…\]), вне комментариев и \verb, и только внутри
 * окружений из белого списка (document, proof, itemize, …) — чтобы не
 * задеть verbatim, tikz, таблицы и прочее с чувствительной вёрсткой.
 * Замена никогда не создаёт пустую строку (пустая строка = \par!):
 * дробится только пробельная цепочка [ \t]+ между непробельными
 * символами.
 *
 * Парсер — конечный автомат по символам (не regexp): вложенность скобок,
 * \begin/\end со стеком, экранирование (\%, \{, \\ и т.д.), control
 * words/symbols, verbatim-окружения (сканируются как сырой текст,
 * т.к. внутри могут быть несбалансированные скобки и %), \verb<делим>.
 */

/** Окружения, содержимое которых сканируется как сырой текст. */
const VERBATIM_ENVS = new Set([
  'verbatim',
  'verbatim*',
  'Verbatim',
  'Verbatim*',
  'lstlisting',
  'minted',
  'alltt',
  'comment',
  'filecontents',
  'filecontents*',
])

/** Окружения по умолчанию, внутри которых можно дробить пробелы. */
export const DEFAULT_SPLIT_ENVS = [
  'document',
  'abstract',
  'proof',
  'theorem',
  'lemma',
  'corollary',
  'proposition',
  'definition',
  'remark',
  'example',
  'itemize',
  'enumerate',
  'description',
  'center',
  'quote',
  'quotation',
  'flushleft',
  'flushright',
]

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

/** Начала строк текста (offset каждой строки). */
function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineColOf(starts: number[], offset: number): { line1: number; col0: number } {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return { line1: lo + 1, col0: offset - starts[lo] }
}

/**
 * Результат преобразования: новый текст + пересчёт позиций в обе стороны.
 * Сегменты: копирующие (текст совпадает) и замены (пробелы → '\n').
 */
export class ExplodedFile {
  /** границы сегментов: новый текст */
  private ns: number[] = []
  /** границы сегментов: исходный текст */
  private os: number[] = []
  private newStarts: number[]
  private origStarts: number[]

  constructor(
    readonly origText: string,
    readonly text: string,
    segmentBounds: Array<{ n: number; o: number }>
  ) {
    for (const b of segmentBounds) {
      this.ns.push(b.n)
      this.os.push(b.o)
    }
    this.newStarts = lineStarts(text)
    this.origStarts = lineStarts(origText)
  }

  /** Смещение в исходном тексте по смещению в новом. */
  newToOrig(newOffset: number): number {
    const i = this.upperSeg(this.ns, newOffset)
    const segLenO = (this.os[i + 1] ?? this.origText.length) - this.os[i]
    const delta = Math.min(Math.max(0, newOffset - this.ns[i]), Math.max(0, segLenO - 1))
    return this.os[i] + delta
  }

  /** Смещение в новом тексте по смещению в исходном. */
  origToNew(origOffset: number): number {
    const i = this.upperSeg(this.os, origOffset)
    const segLenN = (this.ns[i + 1] ?? this.text.length) - this.ns[i]
    const delta = Math.min(Math.max(0, origOffset - this.os[i]), Math.max(0, segLenN - 1))
    return this.ns[i] + delta
  }

  private upperSeg(arr: number[], off: number): number {
    let lo = 0
    let hi = arr.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (arr[mid] <= off) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  /** Позиция в исходнике (строка/колонка, 1-based строка) по позиции в новом тексте. */
  origLineCol(newLine1: number, newCol0: number): { line1: number; col0: number } {
    const ls = this.newStarts[Math.min(Math.max(0, newLine1 - 1), this.newStarts.length - 1)]
    return lineColOf(this.origStarts, this.newToOrig(ls + Math.max(0, newCol0)))
  }

  /** Позиция в новом тексте по позиции в исходнике. */
  newLineCol(origLine1: number, origCol0: number): { line1: number; col0: number } {
    const ls = this.origStarts[Math.min(Math.max(0, origLine1 - 1), this.origStarts.length - 1)]
    return lineColOf(this.newStarts, this.origToNew(ls + Math.max(0, origCol0)))
  }
}

export function explodeTex(
  src: string,
  splitEnvs: string[] = DEFAULT_SPLIT_ENVS
): ExplodedFile {
  const allowed = new Set(splitEnvs)
  const out: string[] = []
  const bounds: Array<{ n: number; o: number }> = []
  let copyFrom = 0 // начало текущего копирующего куска (в src)
  let newLen = 0

  let depth = 0
  let mathInline = false
  let mathDisplay = false
  const envStack: string[] = []

  const flushCopy = (upTo: number) => {
    if (upTo > copyFrom) {
      bounds.push({ n: newLen, o: copyFrom })
      out.push(src.slice(copyFrom, upTo))
      newLen += upTo - copyFrom
    }
    copyFrom = upTo
  }

  const splittable = () =>
    depth === 0 &&
    !mathInline &&
    !mathDisplay &&
    envStack.every(e => allowed.has(e))

  /** Разобрать {имя} после \begin / \end; вернуть [имя, позиция после '}']. */
  const parseEnvName = (from: number): [string, number] | null => {
    let i = from
    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++
    if (src[i] !== '{') return null
    let j = i + 1
    let name = ''
    while (j < src.length && src[j] !== '}') {
      name += src[j]
      j++
    }
    if (src[j] !== '}') return null
    return [name, j + 1]
  }

  let i = 0
  while (i < src.length) {
    const ch = src[i]

    if (ch === '\\') {
      const next = src[i + 1]
      if (next !== undefined && isLetter(next)) {
        // control word
        let j = i + 1
        while (j < src.length && isLetter(src[j])) j++
        let name = src.slice(i + 1, j)
        if (name === 'verb') {
          // \verb<делим>…<делим> (и \verb*) — сырой скан до делимитера
          let k = j
          if (src[k] === '*') k++
          const delim = src[k]
          if (delim !== undefined && delim !== '\n') {
            k++
            while (k < src.length && src[k] !== delim && src[k] !== '\n') k++
            i = Math.min(k + 1, src.length)
            continue
          }
          i = j
          continue
        }
        if (name === 'begin' || name === 'end') {
          const parsed = parseEnvName(j)
          if (parsed) {
            const [env, after] = parsed
            if (name === 'begin') {
              if (VERBATIM_ENVS.has(env)) {
                // сырой скан до \end{env}: внутри могут быть { } % без пар
                const endTag = `\\end{${env}}`
                const idx = src.indexOf(endTag, after)
                i = idx === -1 ? src.length : idx + endTag.length
                continue
              }
              envStack.push(env)
            } else {
              const at = envStack.lastIndexOf(env)
              if (at !== -1) envStack.splice(at, 1)
            }
            i = after
            continue
          }
        }
        i = j
        continue
      }
      // control symbol: \{ \} \% \$ \\ "\ " и т.п. — два символа целиком
      if (next === '[') mathDisplay = true
      else if (next === ']') mathDisplay = false
      else if (next === '(') mathInline = true
      else if (next === ')') mathInline = false
      i += next === undefined ? 1 : 2
      continue
    }

    if (ch === '%') {
      // комментарий до конца строки — внутри ничего не трогаем
      while (i < src.length && src[i] !== '\n') i++
      continue
    }

    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (ch === '$') {
      if (src[i + 1] === '$') {
        mathDisplay = !mathDisplay
        i += 2
      } else {
        mathInline = !mathInline
        i++
      }
      continue
    }

    if ((ch === ' ' || ch === '\t') && splittable()) {
      // максимальная цепочка пробелов/табов
      let e = i
      while (e < src.length && (src[e] === ' ' || src[e] === '\t')) e++
      const prev = src[i - 1]
      const nextCh = src[e]
      const prevOk = prev !== undefined && prev !== '\n' && prev !== '\r'
      const nextOk = nextCh !== undefined && nextCh !== '\n' && nextCh !== '\r'
      if (prevOk && nextOk) {
        flushCopy(i)
        // сегмент-замена: пробелы [i, e) → одиночный '\n'
        bounds.push({ n: newLen, o: i })
        out.push('\n')
        newLen += 1
        copyFrom = e
      }
      i = e
      continue
    }

    i++
  }
  flushCopy(src.length)
  if (bounds.length === 0) bounds.push({ n: 0, o: 0 })

  return new ExplodedFile(src, out.join(''), bounds)
}
