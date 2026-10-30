import { expect } from 'chai'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentUnit, LanguageSupport } from '@codemirror/language'
import { LaTeXLanguage } from '../../../../../../frontend/js/features/source-editor/languages/latex/latex-language'
import {
  applyBeginCompletion,
  buildEnvironmentCompletions,
} from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/environments'
import { editedEnvironment } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/edited-environment'
import { extendOverUnpairedClosingBrace } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/apply'
import { Completions } from '../../../../../../frontend/js/features/source-editor/languages/latex/completions/types'

const latex = new LanguageSupport(LaTeXLanguage)

const makeView = (content: string, cursorPos = 0): EditorView =>
  new EditorView({
    state: EditorState.create({
      doc: Text.of(content.split('\n')),
      selection: { anchor: cursorPos },
      extensions: [latex, editedEnvironment],
    }),
  })

const typeText = (
  view: EditorView,
  from: number,
  to: number,
  insert: string
) => {
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.type',
  })
}

const moveCursor = (view: EditorView, pos: number) => {
  view.dispatch({ selection: { anchor: pos } })
}

const applyBegin = (view: EditorView, name: string, from: number) => {
  const completion = {
    label: `\\begin{${name}} …`,
    extend: extendOverUnpairedClosingBrace,
  }
  applyBeginCompletion(name)(
    view,
    completion,
    from,
    view.state.selection.main.head
  )
}

const snippetText = (view: EditorView, name: string) =>
  `\\begin{${name}}\n${view.state.facet(indentUnit)}\n\\end{${name}}`

describe('applyBeginCompletion', function () {
  describe('editing the name of an existing \\begin', function () {
    it('renames the \\end paired before the name was retyped', function () {
      const before = '\\begin{document}\n'
      const view = makeView(
        before + '\\begin{equation}\ny=x^2\n\\end{equation}\n\\end{document}',
        before.length + '\\begin{equation'.length
      )
      const nameFrom = before.length + '\\begin{'.length

      typeText(view, nameFrom, nameFrom + 'equation'.length, 'ali')
      applyBegin(view, 'align', before.length)

      expect(view.state.doc.toString()).to.equal(
        before + '\\begin{align}\ny=x^2\n\\end{align}\n\\end{document}'
      )
      expect(view.state.selection.main.head).to.equal(
        before.length + '\\begin{align}'.length
      )
    })

    it('renames the paired \\end after a star was deleted', function () {
      const view = makeView(
        '\\begin{align*}\ny=x^2\n\\end{align*}',
        '\\begin{align*'.length
      )

      typeText(view, '\\begin{align'.length, '\\begin{align*'.length, '')
      applyBegin(view, 'align', 0)

      expect(view.state.doc.toString()).to.equal(
        '\\begin{align}\ny=x^2\n\\end{align}'
      )
    })

    it('renames the paired \\end with the cursor after the closing brace', function () {
      const view = makeView(
        '\\begin{equation}\ny=x^2\n\\end{equation}',
        '\\begin{equation'.length
      )

      typeText(view, '\\begin{'.length, '\\begin{equation'.length, 'foo')
      moveCursor(view, '\\begin{foo}'.length)
      applyBegin(view, 'foo', 0)

      expect(view.state.doc.toString()).to.equal(
        '\\begin{foo}\ny=x^2\n\\end{foo}'
      )
    })

    it('renames the inner \\end of nested environments with the same name', function () {
      const before = '\\begin{itemize}\n\\item '
      const view = makeView(
        before + '\\begin{itemize}\n\\item x\n\\end{itemize}\n\\end{itemize}',
        before.length + '\\begin{itemize'.length
      )
      const nameFrom = before.length + '\\begin{'.length

      typeText(view, nameFrom, nameFrom + 'itemize'.length, 'enum')
      applyBegin(view, 'enumerate', before.length)

      expect(view.state.doc.toString()).to.equal(
        before +
          '\\begin{enumerate}\n\\item x\n\\end{enumerate}\n\\end{itemize}'
      )
    })

    it('ignores \\end in comments and verbatim', function () {
      const lines = [
        '\\begin{document}',
        '\\begin{equation}',
        '% \\end{equation}',
        '\\begin{verbatim}',
        '\\end{equation}',
        '\\end{verbatim}',
        'x',
        '\\end{equation}',
        '\\end{document}',
      ]
      const before = '\\begin{document}\n'
      const view = makeView(
        lines.join('\n'),
        before.length + '\\begin{equation'.length
      )

      typeText(
        view,
        before.length + '\\begin{equation'.length,
        before.length + '\\begin{equation'.length,
        '*'
      )
      applyBegin(view, 'equation*', before.length)

      lines[1] = '\\begin{equation*}'
      lines[7] = '\\end{equation*}'
      expect(view.state.doc.toString()).to.equal(lines.join('\n'))
    })

    it('renames the paired \\end when the completion is opened without typing', function () {
      const view = makeView(
        '\\begin{equation}\ny=x^2\n\\end{equation}',
        '\\begin{equ'.length
      )

      applyBegin(view, 'align', 0)

      expect(view.state.doc.toString()).to.equal(
        '\\begin{align}\ny=x^2\n\\end{align}'
      )
    })
  })

  describe('everything else inserts a new \\end', function () {
    it('after typing a new \\begin{} with auto-closed braces', function () {
      const before = '\\begin{document}\nText\n'
      const after = '\nMore\n\\end{document}'
      const view = makeView(
        before + '\\begin{}' + after,
        before.length + '\\begin{'.length
      )

      typeText(
        view,
        before.length + '\\begin{'.length,
        before.length + '\\begin{'.length,
        'ite'
      )
      applyBegin(view, 'itemize', before.length)

      expect(view.state.doc.toString()).to.equal(
        before + snippetText(view, 'itemize') + after
      )
    })

    it('when a \\begin typed inside a list of the same kind is edited', function () {
      const before = '\\begin{itemize}\n\\item a\n'
      const after = '\n\\item b\n\\end{itemize}'
      const view = makeView(
        before + '\\begin{itemize}' + after,
        before.length + '\\begin{itemize'.length
      )
      const nameFrom = before.length + '\\begin{'.length

      typeText(view, nameFrom, nameFrom + 'itemize'.length, 'enum')
      applyBegin(view, 'enumerate', before.length)

      expect(view.state.doc.toString()).to.equal(
        before + snippetText(view, 'enumerate') + after
      )
    })

    it('when the cursor left the \\begin before the completion', function () {
      const view = makeView(
        '\\begin{equation}\nx\n\\end{equation}',
        '\\begin{equation'.length
      )

      typeText(view, '\\begin{equ'.length, '\\begin{equation'.length, '')
      moveCursor(view, view.state.doc.length)
      moveCursor(view, '\\begin{equ'.length)
      applyBegin(view, 'align', 0)

      expect(view.state.doc.toString()).to.equal(
        snippetText(view, 'align') + '\nx\n\\end{equation}'
      )
    })

    it('when the paired \\end was changed during the edit', function () {
      const view = makeView(
        '\\begin{equation}\nx\n\\end{equation}',
        '\\begin{equation'.length
      )

      typeText(view, '\\begin{'.length, '\\begin{equation'.length, 'ali')
      const endNameFrom = '\\begin{ali}\nx\n\\end{'.length
      view.dispatch({
        changes: {
          from: endNameFrom,
          to: endNameFrom + 'equation'.length,
          insert: 'foo',
        },
      })
      applyBegin(view, 'align', 0)

      expect(view.state.doc.toString()).to.equal(
        snippetText(view, 'align') + '\nx\n\\end{foo}'
      )
    })

    const newBeginCases: [string, string, string, string][] = [
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

    for (const [title, before, typed, after] of newBeginCases) {
      it(`for a new \\begin and keeps other environments (${title})`, function () {
        const view = makeView(
          before + typed + after,
          before.length + typed.replace(/}$/, '').length
        )

        applyBegin(view, 'itemize', before.length)

        expect(view.state.doc.toString()).to.equal(
          before + snippetText(view, 'itemize') + after
        )
      })
    }

    it('for an unmatched \\begin', function () {
      const view = makeView('\\begin{theore', '\\begin{theore'.length)

      applyBegin(view, 'theorem', 0)

      expect(view.state.doc.toString()).to.equal(snippetText(view, 'theorem'))
    })

    it('outside existing environments', function () {
      const view = makeView('', 0)

      applyBegin(view, 'align', 0)

      expect(view.state.doc.toString()).to.equal(snippetText(view, 'align'))
    })

    it('with the bundled template for known environments', function () {
      const completions = { commands: [] } as unknown as Completions
      buildEnvironmentCompletions(completions)
      const completion = completions.commands.find(
        item => item.label === '\\begin{itemize} …'
      )!

      const before = '\\begin{document}\n'
      const view = makeView(
        before + '\\beg\n\\end{document}',
        before.length + '\\beg'.length
      )

      ;(completion.apply as any)(
        view,
        completion,
        before.length,
        before.length + '\\beg'.length
      )

      const indent = view.state.facet(indentUnit)
      expect(view.state.doc.toString()).to.equal(
        `${before}\\begin{itemize}\n${indent}\\item \n\\end{itemize}\n\\end{document}`
      )
    })
  })
})
