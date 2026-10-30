import { expect } from 'chai'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentUnit, LanguageSupport } from '@codemirror/language'
import { LaTeXLanguage } from '../../../../../../frontend/js/features/source-editor/languages/latex/latex-language'
import {
  applyBeginCompletion,
  buildEnvironmentCompletions,
} from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/environments'
import { Completions } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/types'
import { extendOverUnpairedClosingBrace } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/apply'

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

  describe('new \\begin inside another environment', function () {
    const cases: [string, string, string, string][] = [
      [
        'unclosed name inside document',
        '\\begin{document}\nText\n',
        '\\begin{ite',
        '\nMore\n\\end{document}',
      ],
      [
        'closed name inside document',
        '\\begin{document}\nText\n',
        '\\begin{ite}',
        '\nMore\n\\end{document}',
      ],
      [
        'closed name inside a generic environment',
        '\\begin{document}\n\\begin{theorem}\nText\n',
        '\\begin{ite}',
        '\n\\end{theorem}\n\\end{document}',
      ],
      [
        'command completion inside document',
        '\\begin{document}\nText\n',
        '\\beg',
        '\nMore\n\\end{document}',
      ],
      [
        'closed name before a nested environment',
        '\\begin{document}\n\\begin{proof}\n',
        '\\begin{ite}',
        '\n\\begin{equation}\nx\n\\end{equation}\n\\end{proof}\n\\end{document}',
      ],
      [
        'closed name inside a list of the same kind',
        '\\begin{itemize}\n\\item a\n',
        '\\begin{ite}',
        '\n\\item b\n\\end{itemize}',
      ],
    ]

    for (const [title, before, typed, after] of cases) {
      it(`inserts a new \\end and keeps other environments (${title})`, function () {
        const from = before.length
        const cursorPos = from + typed.replace(/}$/, '').length
        const view = makeView(before + typed + after, cursorPos)

        const apply = applyBeginCompletion('itemize')
        apply(
          view,
          {
            label: '\\begin{itemize} …',
            extend: extendOverUnpairedClosingBrace,
          } as any,
          from,
          cursorPos
        )

        const indent = view.state.facet(indentUnit)
        expect(view.state.doc.toString()).to.equal(
          before + `\\begin{itemize}\n${indent}\n\\end{itemize}` + after
        )
      })
    }
  })

  it('inserts the bundled template for known environments', function () {
    const completions = { commands: [] } as unknown as Completions
    buildEnvironmentCompletions(completions)
    const completion = completions.commands.find(
      item => item.label === '\\begin{itemize} …'
    )!

    const initial = '\\begin{document}\n\\beg\n\\end{document}'
    const from = '\\begin{document}\n'.length
    const cursorPos = from + '\\beg'.length
    const view = makeView(initial, cursorPos)

    ;(completion.apply as any)(view, completion, from, cursorPos)

    const indent = view.state.facet(indentUnit)
    expect(view.state.doc.toString()).to.equal(
      `\\begin{document}\n\\begin{itemize}\n${indent}\\item \n\\end{itemize}\n\\end{document}`
    )
  })

  it('renames the inner \\end of nested environments with the same name', function () {
    const initial =
      '\\begin{itemize}\n\\item \\begin{itemize}\n\\item x\n\\end{itemize}\n\\end{itemize}'
    const from = '\\begin{itemize}\n\\item '.length
    const cursorPos = from + '\\begin{'.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('enumerate')
    apply(view, { label: '\\begin{enumerate} …' } as any, from, cursorPos)

    expect(view.state.doc.toString()).to.equal(
      '\\begin{itemize}\n\\item \\begin{enumerate}\n\\item x\n\\end{enumerate}\n\\end{itemize}'
    )
  })

  it('renames the pair after the name was partly retyped', function () {
    const initial =
      '\\begin{document}\n\\begin{ali}\ny=x^2\n\\end{equation}\n\\end{document}'
    const from = '\\begin{document}\n'.length
    const cursorPos = from + '\\begin{ali'.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('align')
    apply(view, { label: '\\begin{align} …' } as any, from, cursorPos)

    expect(view.state.doc.toString()).to.equal(
      '\\begin{document}\n\\begin{align}\ny=x^2\n\\end{align}\n\\end{document}'
    )
  })

  it('ignores \\end in comments and verbatim when looking for the pair', function () {
    const initial = [
      '\\begin{document}',
      '\\begin{equ}',
      '% \\end{document}',
      '\\begin{verbatim}',
      '\\end{foo}',
      '\\end{verbatim}',
      '\\end{equation}',
      '\\end{document}',
    ].join('\n')
    const from = '\\begin{document}\n'.length
    const cursorPos = from + '\\begin{equ'.length
    const view = makeView(initial, cursorPos)

    const apply = applyBeginCompletion('equation*')
    apply(view, { label: '\\begin{equation*} …' } as any, from, cursorPos)

    expect(view.state.doc.toString()).to.equal(
      initial
        .replace('\\begin{equ}', '\\begin{equation*}')
        .replace('\\end{equation}', '\\end{equation*}')
    )
  })
})
