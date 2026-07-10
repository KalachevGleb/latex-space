import type { TrackedChange } from '../vendor/rangesTracker'

/**
 * Отображаемая правка: одиночная вставка/удаление или «замена» —
 * агрегированная пара «вставка + удаление сразу за ней».
 */
export interface DisplayChange {
  kind: 'insert' | 'delete' | 'replace'
  /** вставка (для insert и replace) */
  ins?: TrackedChange
  /** удаление (для delete и replace) */
  del?: TrackedChange
  /** позиция начала (для сортировки и перехода) */
  p: number
  /** id всех входящих правок (accept/reject применяются ко всем сразу) */
  ids: string[]
}

/**
 * Правило из веба (review-panel/utils/can-aggregate.ts): вставка и удаление
 * того же автора, стоящее ровно в конце вставки
 * (delete.op.p === insert.op.p + insert.op.i.length), отображаются одной
 * правкой-«заменой»: старый текст → новый. Принятие/отклонение применяется
 * к обеим частям сразу — как в вебе.
 */
export function aggregateChanges(changes: TrackedChange[]): DisplayChange[] {
  const sorted = changes.slice().sort((a, b) => a.op.p - b.op.p)
  const out: DisplayChange[] = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    if (
      c.op.d !== undefined &&
      prev !== undefined &&
      prev.kind === 'insert' &&
      prev.ins?.op.i !== undefined &&
      c.op.p === prev.ins.op.p + prev.ins.op.i.length &&
      (c.metadata?.user_id ?? '') === (prev.ins.metadata?.user_id ?? '')
    ) {
      out[out.length - 1] = {
        kind: 'replace',
        ins: prev.ins,
        del: c,
        p: prev.p,
        ids: [...prev.ids, c.id],
      }
      continue
    }
    out.push(
      c.op.i !== undefined
        ? { kind: 'insert', ins: c, p: c.op.p, ids: [c.id] }
        : { kind: 'delete', del: c, p: c.op.p, ids: [c.id] }
    )
  }
  return out
}
