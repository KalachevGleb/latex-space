import { expect } from 'chai'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { LanguageSupport } from '@codemirror/language'
import { LaTeXLanguage } from '../../../../../../frontend/js/features/source-editor/languages/latex/latex-language'
import { applyBeginCompletion } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/environments'

const latex = new LanguageSupport(LaTeXLanguage)

const makeView = (content: string, cursorPos = 0): EditorView =>
  new EditorView({
    state: EditorState.create({
      doc: Text.of(content.split('\n')),
      selection: { anchor: cursorPos },
      extensions: [latex],
    }),
  })

describe('applyBeginCompletion', function () {
  it('renames matching \\end when editing existing \\begin', function () {
    const initial = '\\begin{equation}\ny=x^2\n\\end{equation}'
    const cursorPos = '\\begin{equ'.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('align')
    apply(view, { label: '\\begin{align} …' } as any, 0, cursorPos)

    expect(view.state.doc.toString()).to.equal(
      '\\begin{align}\ny=x^2\n\\end{align}'
    )
  })

  it('renames matching \\end even when star was deleted before completion', function () {
    const initial = '\\begin{align}\ny=x^2\n\\end{align*}'
    const cursorPos = '\\begin{align}'.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('align')
    apply(view, { label: '\\begin{align} …' } as any, 0, cursorPos)

    expect(view.state.doc.toString()).to.equal(
      '\\begin{align}\ny=x^2\n\\end{align}'
    )
  })

  it('adds \\end when completion is accepted for unmatched \\begin', function () {
    const initial = '\\begin{theore'
    const cursorPos = initial.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('theorem')
    apply(view, { label: '\\begin{theorem} …' } as any, 0, cursorPos)

    expect(view.state.doc.toString()).to.contain('\\begin{theorem}')
    expect(view.state.doc.toString()).to.contain('\\end{theorem}')
  })

  it('inserts snippet when outside existing environment', function () {
    const view = makeView('', 0)

    const apply = applyBeginCompletion('align')
    apply(view, { label: '\\begin{align} …' } as any, 0, 0)

    expect(view.state.doc.toString()).to.contain('\\begin{align}')
    expect(view.state.doc.toString()).to.contain('\\end{align}')
  })
})
