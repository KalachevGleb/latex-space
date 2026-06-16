import { expect } from 'chai'
import {
  buildCommentsMap,
  selectResolvedThreads,
} from '@/features/review-panel/utils/resolved-comments'

const comment = (threadId: string, overrides = {}) => ({
  id: threadId,
  op: { p: 0, c: 'quoted', t: threadId },
  metadata: { user_id: 'user-1' },
  ...overrides,
})

const ranges = (comments: any[]) => ({ docId: 'doc', changes: [], comments })

describe('resolved-comments utils', function () {
  describe('buildCommentsMap', function () {
    it('collects comments from several documents keyed by thread id', function () {
      const map = buildCommentsMap([
        ranges([comment('t1')]) as any,
        ranges([comment('t2')]) as any,
      ])
      expect([...map.keys()].sort()).to.deep.equal(['t1', 't2'])
    })

    it('lets later ranges override earlier ones (live current doc wins)', function () {
      const snapshot = ranges([comment('t1', { op: { p: 0, c: 'old', t: 't1' } })])
      const live = ranges([comment('t1', { op: { p: 0, c: 'new', t: 't1' } })])
      const map = buildCommentsMap([snapshot as any, live as any])
      expect(map.get('t1')!.op.c).to.equal('new')
    })

    it('ignores undefined ranges', function () {
      const map = buildCommentsMap([undefined, ranges([comment('t1')]) as any])
      expect(map.has('t1')).to.be.true
      expect(map.size).to.equal(1)
    })
  })

  describe('selectResolvedThreads', function () {
    it('returns threads marked resolved that still have a comment', function () {
      const threads = {
        t1: { resolved: true, resolved_at: '2024-01-01T00:00:00Z', messages: [] },
      }
      const map = buildCommentsMap([ranges([comment('t1')]) as any])
      const result = selectResolvedThreads(threads as any, map)
      expect(result.map(r => r.id)).to.deep.equal(['t1'])
    })

    it('treats a comment-level resolved flag as resolved (history-ot)', function () {
      const threads = { t1: { messages: [] } } // no thread.resolved
      const map = buildCommentsMap([
        ranges([comment('t1', { resolved: true })]) as any,
      ])
      const result = selectResolvedThreads(threads as any, map)
      expect(result.map(r => r.id)).to.deep.equal(['t1'])
    })

    it('excludes unresolved threads', function () {
      const threads = { t1: { resolved: false, messages: [] } }
      const map = buildCommentsMap([ranges([comment('t1')]) as any])
      expect(selectResolvedThreads(threads as any, map)).to.have.length(0)
    })

    it('excludes resolved threads that have no matching comment', function () {
      const threads = {
        t1: { resolved: true, resolved_at: '2024-01-01T00:00:00Z', messages: [] },
      }
      // empty comments map -> nothing to display
      const result = selectResolvedThreads(threads as any, new Map())
      expect(result).to.have.length(0)
    })

    it('sorts resolved threads by resolved_at, newest first', function () {
      const threads = {
        older: { resolved: true, resolved_at: '2024-01-01T00:00:00Z', messages: [] },
        newer: { resolved: true, resolved_at: '2024-06-01T00:00:00Z', messages: [] },
      }
      const map = buildCommentsMap([
        ranges([comment('older'), comment('newer')]) as any,
      ])
      const result = selectResolvedThreads(threads as any, map)
      expect(result.map(r => r.id)).to.deep.equal(['newer', 'older'])
    })

    it('returns an empty array when threads are not loaded', function () {
      expect(selectResolvedThreads(undefined, new Map())).to.deep.equal([])
    })
  })
})
