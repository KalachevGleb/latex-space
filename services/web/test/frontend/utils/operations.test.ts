import { expect } from 'chai'
import {
  isInsertOperation,
  isCommentOperation,
  isDeleteOperation,
  isEditOperation,
  isInsertChange,
  isCommentChange,
  isDeleteChange,
  visibleTextLength,
} from '@/utils/operations'

const insertOp = { p: 0, i: 'hello' }
const deleteOp = { p: 0, d: 'bye' }
const commentOp = { p: 0, c: 'note', t: 'thread-1' }

describe('operations utils', function () {
  describe('operation type guards', function () {
    it('identifies insert operations', function () {
      expect(isInsertOperation(insertOp as any)).to.be.true
      expect(isInsertOperation(deleteOp as any)).to.be.false
      expect(isInsertOperation(commentOp as any)).to.be.false
    })

    it('identifies delete operations', function () {
      expect(isDeleteOperation(deleteOp as any)).to.be.true
      expect(isDeleteOperation(insertOp as any)).to.be.false
    })

    it('identifies comment operations', function () {
      expect(isCommentOperation(commentOp as any)).to.be.true
      expect(isCommentOperation(insertOp as any)).to.be.false
    })

    it('treats inserts and deletes as edit operations but not comments', function () {
      expect(isEditOperation(insertOp as any)).to.be.true
      expect(isEditOperation(deleteOp as any)).to.be.true
      expect(isEditOperation(commentOp as any)).to.be.false
    })
  })

  describe('change type guards', function () {
    it('identifies insert/delete/comment changes by their op', function () {
      expect(isInsertChange({ op: insertOp } as any)).to.be.true
      expect(isDeleteChange({ op: deleteOp } as any)).to.be.true
      expect(isCommentChange({ op: commentOp } as any)).to.be.true
      expect(isInsertChange({ op: deleteOp } as any)).to.be.false
    })
  })

  describe('visibleTextLength', function () {
    it('returns the comment text length for comments', function () {
      expect(visibleTextLength(commentOp as any)).to.equal('note'.length)
    })

    it('returns the inserted text length for inserts', function () {
      expect(visibleTextLength(insertOp as any)).to.equal('hello'.length)
    })

    it('returns 0 for deletions (no visible text added)', function () {
      expect(visibleTextLength(deleteOp as any)).to.equal(0)
    })
  })
})
