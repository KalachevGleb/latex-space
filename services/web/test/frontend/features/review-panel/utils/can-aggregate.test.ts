import { expect } from 'chai'
import { canAggregate } from '@/features/review-panel/utils/can-aggregate'

// canAggregate decides whether a tracked deletion that immediately follows a
// tracked insertion (by the same user, at the adjacent position) should be
// merged into a single "replaced text" entry in the review panel.

const insertion = (overrides = {}) => ({
  id: 'ins',
  op: { p: 10, i: 'hello' },
  metadata: { user_id: 'user-1', ts: 1 },
  ...overrides,
})

const deletion = (overrides = {}) => ({
  id: 'del',
  op: { p: 15, d: 'world' },
  metadata: { user_id: 'user-1', ts: 2 },
  ...overrides,
})

describe('canAggregate', function () {
  it('aggregates a deletion that directly follows an insertion by the same user', function () {
    // insertion at p=10 with length 5 ends at 15; deletion starts at 15
    expect(Boolean(canAggregate(deletion() as any, insertion() as any))).to.be
      .true
  })

  it('does not aggregate when the users differ', function () {
    const del = deletion({ metadata: { user_id: 'user-2' } })
    expect(Boolean(canAggregate(del as any, insertion() as any))).to.be.false
  })

  it('does not aggregate when the positions are not adjacent', function () {
    const del = deletion({ op: { p: 16, d: 'world' } })
    expect(Boolean(canAggregate(del as any, insertion() as any))).to.be.false
  })

  it('does not aggregate when the deletion has no user metadata', function () {
    const del = deletion({ metadata: undefined })
    expect(Boolean(canAggregate(del as any, insertion() as any))).to.be.false
  })

  it('accounts for the insertion length when matching the position', function () {
    const ins = insertion({ op: { p: 3, i: 'abcdefg' } }) // ends at 10
    const del = deletion({ op: { p: 10, d: 'x' } })
    expect(Boolean(canAggregate(del as any, ins as any))).to.be.true
  })
})
