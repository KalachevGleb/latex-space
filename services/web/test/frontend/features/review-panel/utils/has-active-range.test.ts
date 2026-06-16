import { expect } from 'chai'
import { hasActiveRange } from '@/features/review-panel/utils/has-active-range'

// hasActiveRange decides whether the review panel has anything to show for the
// current file (used to toggle the empty state). A resolved comment thread must
// NOT count as an active range.

const ranges = (overrides = {}) => ({
  docId: 'doc-1',
  changes: [],
  comments: [],
  ...overrides,
})

describe('hasActiveRange', function () {
  it('returns undefined while data is still loading', function () {
    expect(hasActiveRange(undefined, {})).to.equal(undefined)
    expect(hasActiveRange(ranges() as any, undefined)).to.equal(undefined)
  })

  it('returns true when there is at least one tracked change', function () {
    const r = ranges({ changes: [{ id: 'c1', op: { p: 0, i: 'x' } }] })
    expect(hasActiveRange(r as any, {})).to.equal(true)
  })

  it('returns true when a comment has an unresolved thread', function () {
    const r = ranges({ comments: [{ id: 'm1', op: { p: 0, t: 'thread-1' } }] })
    const threads = { 'thread-1': { resolved: false, messages: [] } }
    expect(hasActiveRange(r as any, threads as any)).to.equal(true)
  })

  it('returns false when the only comment thread is resolved', function () {
    const r = ranges({ comments: [{ id: 'm1', op: { p: 0, t: 'thread-1' } }] })
    const threads = { 'thread-1': { resolved: true, messages: [] } }
    expect(hasActiveRange(r as any, threads as any)).to.equal(false)
  })

  it('returns false when a comment has no matching thread', function () {
    const r = ranges({ comments: [{ id: 'm1', op: { p: 0, t: 'missing' } }] })
    expect(hasActiveRange(r as any, {})).to.equal(false)
  })

  it('returns false when there are no changes and no comments', function () {
    expect(hasActiveRange(ranges() as any, {})).to.equal(false)
  })
})
