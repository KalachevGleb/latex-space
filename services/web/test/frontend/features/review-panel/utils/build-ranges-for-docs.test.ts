import { expect } from 'chai'
import { buildRangesForDocs } from '@/features/review-panel/utils/build-ranges-for-docs'

// This is the logic behind the "Overview" tab. The user-visible bug was that
// the overview only showed comments from the currently-open file. These tests
// pin down that ranges for OTHER files are included too.

const ranges = (docId: string, comments: any[] = []) => ({
  docId,
  changes: [],
  comments,
})

const comment = (t: string) => ({ id: t, op: { p: 0, c: 'x', t } })

const docs = [
  { doc: { id: 'doc-current', name: 'main.tex' }, path: 'main.tex' },
  { doc: { id: 'doc-other', name: 'chapter.tex' }, path: 'chapter.tex' },
]

describe('buildRangesForDocs', function () {
  it('includes ranges for BOTH the current file and other files', function () {
    const docRanges = ranges('doc-current', [comment('t-current')])
    const projectRanges = new Map([
      ['doc-current', ranges('doc-current', [])],
      ['doc-other', ranges('doc-other', [comment('t-other')])],
    ])

    const result = buildRangesForDocs(docs, docRanges, projectRanges, 0)

    expect(result).to.not.equal(undefined)
    expect([...result!.keys()].sort()).to.deep.equal(['doc-current', 'doc-other'])
    // current file uses the live ranges, not the (empty) snapshot copy
    expect(result!.get('doc-current')!.comments).to.have.length(1)
    expect(result!.get('doc-other')!.comments[0].op.t).to.equal('t-other')
  })

  it('shows only the current file when other files are missing from the snapshot (the reported bug)', function () {
    const docRanges = ranges('doc-current', [comment('t-current')])
    const projectRanges = new Map([
      ['doc-current', ranges('doc-current', [comment('t-current')])],
      // doc-other intentionally absent -> regression marker for "only current file"
    ])

    const result = buildRangesForDocs(docs, docRanges, projectRanges, 0)

    expect([...result!.keys()]).to.deep.equal(['doc-current'])
  })

  it('looks other files up by path under history-OT (otMigrationStage === 1)', function () {
    const docRanges = ranges('doc-current')
    const projectRanges = new Map([
      ['chapter.tex', ranges('doc-other', [comment('t-other')])], // keyed by path
    ])

    const result = buildRangesForDocs(docs, docRanges, projectRanges, 1)

    expect(result!.has('doc-other')).to.be.true
    expect(result!.get('doc-other')!.comments[0].op.t).to.equal('t-other')
  })

  it('returns undefined until docs, current ranges and project ranges are all loaded', function () {
    const projectRanges = new Map()
    expect(buildRangesForDocs(undefined, ranges('d'), projectRanges, 0)).to.equal(
      undefined
    )
    expect(buildRangesForDocs(docs, undefined, projectRanges, 0)).to.equal(
      undefined
    )
    expect(buildRangesForDocs(docs, ranges('d'), undefined, 0)).to.equal(
      undefined
    )
  })
})
