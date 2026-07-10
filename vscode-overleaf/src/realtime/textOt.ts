/**
 * Операционные преобразования ShareJS text-old — тип, который использует
 * document-updater. Операция — последовательность компонент; каждая
 * компонента применяется к тексту, полученному после предыдущей:
 *   {p, i: "текст"} — вставка, {p, d: "текст"} — удаление,
 *   {p, c: "текст", t: threadId} — якорь комментария (текст не меняет).
 */

export interface InsertComponent {
  p: number
  i: string
  /** undo-флаг: отмена tracked-удаления (RangesTracker снимает маркер) */
  u?: boolean
}
export interface DeleteComponent {
  p: number
  d: string
}
export interface CommentComponent {
  p: number
  c: string
  t: string
}
export type TextOpComponent =
  | InsertComponent
  | DeleteComponent
  | CommentComponent
export type TextOp = TextOpComponent[]

export function isInsert(c: TextOpComponent): c is InsertComponent {
  return typeof (c as InsertComponent).i === 'string'
}
export function isDelete(c: TextOpComponent): c is DeleteComponent {
  return typeof (c as DeleteComponent).d === 'string'
}

export class OtError extends Error {}

/** Применить операцию к строке. */
export function applyOp(text: string, op: TextOp): string {
  for (const c of op) {
    if (isInsert(c)) {
      if (c.p < 0 || c.p > text.length) {
        throw new OtError(`вставка за пределами текста (p=${c.p})`)
      }
      text = text.slice(0, c.p) + c.i + text.slice(c.p)
    } else if (isDelete(c)) {
      const actual = text.slice(c.p, c.p + c.d.length)
      if (actual !== c.d) {
        throw new OtError(
          `удаляемый текст не совпадает (p=${c.p}): «${actual.slice(0, 40)}» ≠ «${c.d.slice(0, 40)}»`
        )
      }
      text = text.slice(0, c.p) + text.slice(c.p + c.d.length)
    }
    // комментарии текст не меняют
  }
  return text
}

/** Сдвиг позиции pos компонентой c (insertAfter — правило для равенства). */
function transformPosition(
  pos: number,
  c: TextOpComponent,
  insertAfter = false
): number {
  if (isInsert(c)) {
    if (c.p < pos || (c.p === pos && insertAfter)) return pos + c.i.length
    return pos
  }
  if (isDelete(c)) {
    if (pos <= c.p) return pos
    if (pos <= c.p + c.d.length) return c.p
    return pos - c.d.length
  }
  return pos
}

function append(dest: TextOp, c: TextOpComponent): void {
  if (isInsert(c) && c.i === '') return
  if (isDelete(c) && c.d === '') return
  const last = dest[dest.length - 1]
  if (last && isInsert(last) && isInsert(c) && last.p + last.i.length === c.p) {
    last.i += c.i
    return
  }
  if (last && isDelete(last) && isDelete(c) && c.p === last.p) {
    last.d += c.d
    return
  }
  dest.push({ ...c })
}

/**
 * Преобразовать компоненту c относительно компоненты otherC
 * (правила ShareJS text-old). side: 'left' — наша операция, 'right' — чужая.
 */
function transformComponent(
  dest: TextOp,
  c: TextOpComponent,
  otherC: TextOpComponent,
  side: 'left' | 'right'
): void {
  if (!isInsert(otherC) && !isDelete(otherC)) {
    // комментарий позиции не меняет
    append(dest, c)
    return
  }
  if (isInsert(c)) {
    append(dest, {
      p: transformPosition(c.p, otherC, side === 'right'),
      i: c.i,
    })
    return
  }
  if (!isDelete(c)) {
    // компонента-комментарий: только сдвигаем позицию
    append(dest, { ...c, p: transformPosition(c.p, otherC) })
    return
  }
  // c — удаление
  if (isInsert(otherC)) {
    let deleted = c.d
    if (c.p < otherC.p) {
      append(dest, { d: deleted.slice(0, otherC.p - c.p), p: c.p })
      deleted = deleted.slice(otherC.p - c.p)
    }
    if (deleted !== '') {
      append(dest, { d: deleted, p: c.p + otherC.i.length })
    }
    return
  }
  // удаление против удаления
  if (c.p >= otherC.p + otherC.d.length) {
    append(dest, { d: c.d, p: c.p - otherC.d.length })
  } else if (c.p + c.d.length <= otherC.p) {
    append(dest, c)
  } else {
    // пересечение
    let newD = ''
    if (c.p < otherC.p) newD = c.d.slice(0, otherC.p - c.p)
    if (c.p + c.d.length > otherC.p + otherC.d.length) {
      newD += c.d.slice(otherC.p + otherC.d.length - c.p)
    }
    const intersectStart = Math.max(c.p, otherC.p)
    const intersectEnd = Math.min(c.p + c.d.length, otherC.p + otherC.d.length)
    const cIntersect = c.d.slice(intersectStart - c.p, intersectEnd - c.p)
    const otherIntersect = otherC.d.slice(
      intersectStart - otherC.p,
      intersectEnd - otherC.p
    )
    if (cIntersect !== otherIntersect) {
      throw new OtError(
        'конкурирующие удаления разного текста в одной области'
      )
    }
    if (newD !== '') {
      append(dest, { d: newD, p: transformPosition(c.p, otherC) })
    }
  }
}

/** Преобразовать операцию op относительно операции otherOp. */
export function transformOp(
  op: TextOp,
  otherOp: TextOp,
  side: 'left' | 'right'
): TextOp {
  let result = op
  for (const otherC of otherOp) {
    const next: TextOp = []
    for (const c of result) {
      transformComponent(next, c, otherC, side)
    }
    result = next
  }
  return result
}

/** Композиция: op1, затем op2 (для text-old — конкатенация). */
export function composeOp(op1: TextOp, op2: TextOp): TextOp {
  const result: TextOp = op1.map(c => ({ ...c }))
  for (const c of op2) append(result, c)
  return result
}

/** Простая diff-операция prefix/suffix: превратить a в b. */
export function diffAsOp(a: string, b: string): TextOp {
  return diffReplaceOps(a, b, 0)
}

type Hunk =
  | { kind: 'eq'; text: string }
  | { kind: 'del'; text: string }
  | { kind: 'ins'; text: string }

/** Разбить на токены: слова и пробельные последовательности. */
function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? []
}

/** Разбить на строки (с завершающим \n у каждой, кроме последней). */
function tokenizeLines(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

/** LCS-диффы по токенам (DP); null — если слишком велико. */
function tokenDiff(a: string[], b: string[], cap = 1_000_000): Hunk[] | null {
  const n = a.length
  const m = b.length
  if (n * m > cap) return null
  // таблица длин LCS
  const dp = new Uint32Array((n + 1) * (m + 1))
  const idx = (i: number, j: number) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[idx(i, j)] =
        a[i] === b[j]
          ? dp[idx(i + 1, j + 1)] + 1
          : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)])
    }
  }
  const hunks: Hunk[] = []
  const push = (kind: Hunk['kind'], text: string) => {
    const last = hunks[hunks.length - 1]
    if (last && last.kind === kind) last.text += text
    else hunks.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('eq', a[i])
      i++
      j++
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      push('del', a[i])
      i++
    } else {
      push('ins', b[j])
      j++
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('ins', b[j++])
  return hunks
}

/**
 * Diff середины замены. Сначала пословный; если текст слишком велик для
 * пословного DP (например, ИИ-агент переписал файл целиком) — построчный,
 * с пословным уточнением каждой изменённой пары «удалённые строки +
 * вставленные строки». null — только если даже построчный DP слишком велик.
 */
function diffHunks(a: string, b: string): Hunk[] | null {
  const words = tokenDiff(tokenize(a), tokenize(b))
  if (words) return words
  // построчный уровень: DP-таблица по строкам заметно меньше
  const lines = tokenDiff(tokenizeLines(a), tokenizeLines(b), 4_000_000)
  if (!lines) return null
  const out: Hunk[] = []
  for (let k = 0; k < lines.length; k++) {
    const h = lines[k]
    const next = lines[k + 1]
    if (h.kind !== 'eq' && next && next.kind !== 'eq' && next.kind !== h.kind) {
      // пара «удалено + вставлено» — уточняем пословно
      const del = h.kind === 'del' ? h : (next as Hunk)
      const ins = h.kind === 'ins' ? h : (next as Hunk)
      const sub = tokenDiff(tokenize(del.text), tokenize(ins.text))
      if (sub) out.push(...sub)
      else out.push({ kind: 'del', text: del.text }, { kind: 'ins', text: ins.text })
      k++
      continue
    }
    out.push(h)
  }
  return out
}

/**
 * Слить близкие изменения: короткие совпадающие участки (≤ mergeGap символов)
 * между изменениями включаются в изменение — картина правок получается
 * цельной, без «рваного» посимвольного шума.
 */
function mergeHunks(hunks: Hunk[], mergeGap: number): Hunk[] {
  const out: Hunk[] = []
  let delBuf = ''
  let insBuf = ''
  const flush = () => {
    if (delBuf) out.push({ kind: 'del', text: delBuf })
    if (insBuf) out.push({ kind: 'ins', text: insBuf })
    delBuf = ''
    insBuf = ''
  }
  const changeAhead = (k: number): boolean => {
    const next = hunks[k + 1]
    return !!next && next.kind !== 'eq'
  }
  for (let k = 0; k < hunks.length; k++) {
    const h = hunks[k]
    if (h.kind === 'eq') {
      if (h.text.length <= mergeGap && (delBuf || insBuf) && changeAhead(k)) {
        // растворить короткий совпадающий участок внутри области правки
        delBuf += h.text
        insBuf += h.text
      } else {
        flush()
        out.push(h)
      }
    } else if (h.kind === 'del') {
      delBuf += h.text
    } else {
      insBuf += h.text
    }
  }
  flush()
  return out
}

/**
 * Минимальная операция «заменить фрагмент»: общий префикс/суффикс +
 * пословный diff середины со слиянием близких изменений.
 * Используется при замене выделения (paste поверх) и при пересинхронизации,
 * чтобы tracked changes выглядели естественно, а не «всё удалить + всё вставить».
 */
export function diffReplaceOps(
  a: string,
  b: string,
  basePos: number,
  mergeGap = 3
): TextOp {
  if (a === b) return []
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const op: TextOp = []
  let pos = basePos + start

  if (midA === '' || midB === '') {
    if (midA) op.push({ p: pos, d: midA })
    if (midB) op.push({ p: pos, i: midB })
    return op
  }

  const hunks = diffHunks(midA, midB)
  if (!hunks) {
    // слишком большая замена — честные удаление и вставка
    op.push({ p: pos, d: midA })
    op.push({ p: pos, i: midB })
    return op
  }
  for (const h of mergeHunks(hunks, mergeGap)) {
    if (h.kind === 'eq') {
      pos += h.text.length
    } else if (h.kind === 'del') {
      op.push({ p: pos, d: h.text })
    } else {
      op.push({ p: pos, i: h.text })
      pos += h.text.length
    }
  }
  return op
}
