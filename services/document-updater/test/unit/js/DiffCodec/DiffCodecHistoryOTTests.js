const { expect } = require('chai')
const tk = require('timekeeper')
// NOTE: use a plain require (not SandboxedModule) so that the TextOperation /
// TrackingProps classes used by DiffCodec are the *same* instances as the ones
// imported below — otherwise `op.equals(expected)` compares across two separate
// copies of overleaf-editor-core and always fails.
const DiffCodec = require('../../../../app/js/DiffCodec.js')
const {
  StringFileData,
  TextOperation,
  TrackingProps,
} = require('overleaf-editor-core')

describe('DiffCodec (history-OT)', function () {
  describe('diffAsHistoryOTEditOperation', function () {
    it('produces a retain/insert/retain op for an insertion', function () {
      const op = DiffCodec.diffAsHistoryOTEditOperation(
        new StringFileData('hello world'),
        'hello brave world'
      )
      const expected = new TextOperation().retain(6).insert('brave ').retain(5)
      expect(op.equals(expected)).to.be.true

      const file = new StringFileData('hello world')
      op.apply(file)
      expect(file.getContent()).to.equal('hello brave world')
    })

    it('produces a remove op for a deletion', function () {
      const op = DiffCodec.diffAsHistoryOTEditOperation(
        new StringFileData('hello brave world'),
        'hello world'
      )
      const expected = new TextOperation().retain(6).remove(6).retain(5)
      expect(op.equals(expected)).to.be.true

      const file = new StringFileData('hello brave world')
      op.apply(file)
      expect(file.getContent()).to.equal('hello world')
    })

    it('produces a no-op when the content is unchanged', function () {
      const op = DiffCodec.diffAsHistoryOTEditOperation(
        new StringFileData('unchanged'),
        'unchanged'
      )
      expect(op.baseLength).to.equal('unchanged'.length)
      expect(op.targetLength).to.equal('unchanged'.length)

      const file = new StringFileData('unchanged')
      op.apply(file)
      expect(file.getContent()).to.equal('unchanged')
    })
  })

  describe('diffAsHistoryOTTrackedOperation', function () {
    beforeEach(function () {
      this.now = new Date()
      tk.freeze(this.now)
      this.userId = 'user-1'
    })

    afterEach(function () {
      tk.reset()
    })

    it('marks an insertion as a tracked insert', function () {
      const op = DiffCodec.diffAsHistoryOTTrackedOperation(
        new StringFileData('hello world'),
        'hello brave world',
        this.userId
      )
      const tracking = new TrackingProps('insert', this.userId, this.now)
      const expected = new TextOperation()
        .retain(6)
        .insert('brave ', { tracking })
        .retain(5)
      expect(op.equals(expected)).to.be.true
    })

    it('marks a deletion as a tracked delete that retains (does not remove) the text', function () {
      const op = DiffCodec.diffAsHistoryOTTrackedOperation(
        new StringFileData('hello brave world'),
        'hello world',
        this.userId
      )
      const tracking = new TrackingProps('delete', this.userId, this.now)
      const expected = new TextOperation()
        .retain(6)
        .retain(6, { tracking })
        .retain(5)
      expect(op.equals(expected)).to.be.true
      // Base/target length unchanged: deleted text is retained, only flagged.
      expect(op.baseLength).to.equal('hello brave world'.length)
      expect(op.targetLength).to.equal('hello brave world'.length)

      const file = new StringFileData('hello brave world')
      op.apply(file)
      // raw content keeps the text, but it is now tracked as deleted
      expect(file.getContent()).to.equal('hello brave world')
      expect(file.getContent({ filterTrackedDeletes: true })).to.equal(
        'hello world'
      )
    })

    it('represents a replacement as a tracked insert followed by a tracked delete', function () {
      const op = DiffCodec.diffAsHistoryOTTrackedOperation(
        new StringFileData('the cat sat'),
        'the dog sat',
        this.userId
      )
      const insertTracking = new TrackingProps('insert', this.userId, this.now)
      const deleteTracking = new TrackingProps('delete', this.userId, this.now)
      const expected = new TextOperation()
        .retain(4)
        .insert('dog', { tracking: insertTracking })
        .retain(3, { tracking: deleteTracking })
        .retain(4)
      expect(op.equals(expected)).to.be.true

      const file = new StringFileData('the cat sat')
      op.apply(file)
      // both the insertion and the (tracked) original are present in raw content
      expect(file.getContent()).to.equal('the dogcat sat')
      // with tracked deletes filtered out, the result is the desired text
      expect(file.getContent({ filterTrackedDeletes: true })).to.equal(
        'the dog sat'
      )
    })
  })
})
