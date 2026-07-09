/**
 * Типы для векторизованной библиотеки libraries/ranges-tracker —
 * та же реализация, что использует document-updater на сервере.
 */

export interface TrackedChange {
  id: string
  op: { p: number; i?: string; d?: string }
  metadata?: { user_id?: string; ts?: string | Date }
}

export interface TrackedComment {
  id: string
  op: { p: number; c: string; t: string }
  metadata?: Record<string, unknown>
}

declare class RangesTracker {
  constructor(changes?: TrackedChange[], comments?: TrackedComment[])
  changes: TrackedChange[]
  comments: TrackedComment[]
  track_changes: boolean
  static generateIdSeed(): string
  static generateId(): string
  getIdSeed(): string
  setIdSeed(seed: string): void
  applyOp(
    op: { p: number; i?: string; d?: string; c?: string; t?: string; u?: boolean },
    metadata?: { user_id?: string; ts?: string | Date }
  ): void
  applyOps(
    ops: Array<{ p: number; i?: string; d?: string; c?: string; t?: string }>,
    metadata?: { user_id?: string; ts?: string | Date }
  ): void
  getChange(id: string): TrackedChange | undefined
  getChanges(ids: string[]): TrackedChange[]
  removeChangeId(id: string): void
  removeChangeIds(ids: string[]): void
  getComment(id: string): TrackedComment | undefined
  removeCommentId(id: string): void
  validate(text: string): void
}

export default RangesTracker
