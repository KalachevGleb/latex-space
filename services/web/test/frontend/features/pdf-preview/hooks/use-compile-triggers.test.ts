import { expect } from 'chai'
import { startCompileKeypress } from '../../../../../frontend/js/features/pdf-preview/hooks/use-compile-triggers'

const keydown = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('startCompileKeypress', function () {
  it('starts compiling on Ctrl+S and Cmd+S', function () {
    expect(
      startCompileKeypress(keydown({ key: 's', code: 'KeyS', ctrlKey: true }))
    ).to.be.true
    expect(
      startCompileKeypress(keydown({ key: 's', code: 'KeyS', metaKey: true }))
    ).to.be.true
  })

  it('starts compiling on Ctrl+S with Caps Lock on', function () {
    expect(
      startCompileKeypress(keydown({ key: 'S', code: 'KeyS', ctrlKey: true }))
    ).to.be.true
  })

  it('starts compiling on Ctrl+S and Cmd+S with the Russian layout', function () {
    expect(
      startCompileKeypress(keydown({ key: 'ы', code: 'KeyS', ctrlKey: true }))
    ).to.be.true
    expect(
      startCompileKeypress(keydown({ key: 'Ы', code: 'KeyS', ctrlKey: true }))
    ).to.be.true
    expect(
      startCompileKeypress(keydown({ key: 'ы', code: 'KeyS', metaKey: true }))
    ).to.be.true
  })

  it('follows the letter, not the key position, in other Latin layouts', function () {
    // Dvorak: the S key position types "o", and "s" is on the ; key
    expect(
      startCompileKeypress(keydown({ key: 'o', code: 'KeyS', ctrlKey: true }))
    ).not.to.be.true
    expect(
      startCompileKeypress(
        keydown({ key: 's', code: 'Semicolon', ctrlKey: true })
      )
    ).to.be.true
  })

  it('ignores other keys and modifiers', function () {
    expect(startCompileKeypress(keydown({ key: 'ы', code: 'KeyS' }))).not.to.be
      .true
    expect(
      startCompileKeypress(keydown({ key: 'ф', code: 'KeyA', ctrlKey: true }))
    ).not.to.be.true
    expect(
      startCompileKeypress(
        keydown({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true })
      )
    ).not.to.be.true
    expect(
      startCompileKeypress(
        keydown({ key: 'ы', code: 'KeyS', ctrlKey: true, altKey: true })
      )
    ).not.to.be.true
  })
})
