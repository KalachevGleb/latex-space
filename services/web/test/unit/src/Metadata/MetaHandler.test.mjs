import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath = '../../../../app/src/Features/Metadata/MetaHandler.mjs'

describe('MetaHandler', function () {
  beforeEach(async function (ctx) {
    ctx.projectId = 'someprojectid'
    ctx.docId = 'somedocid'

    ctx.lines = [
      '\\usepackage{ foo, bar }',
      '\\usepackage{baz}',
      'one',
      '\\label{aaa}',
      'two',
      'commented label % \\label{bbb}', // bbb should not be in the returned labels
      '\\label{ccc}%bar', // ccc should be in the returned labels
      '\\label{ddd} % bar', // ddd should be in the returned labels
      '\\label{ e,f,g }', // e,f,g should be in the returned labels
      '\\begin{lstlisting}[label=foo, caption={Test}]', // foo should be in the returned labels
      '\\begin{lstlisting}[label={lst:foo},caption={Test}]', // lst:foo should be in the returned labels
      '\\bibitem{ref1}', // ref1 should be in bibitems
      '\\Bibitem{ref2}', // ref2 should be in bibitems
      '\\RBibitem{ref3}', // ref3 should be in bibitems
      '\\newcommand{\\publicmacro}{x}',
      '\\newcommand{\\internal@macro}{x}',
      '\\def\\plainmacro{x}',
      '\\def\\internal@def{x}',
      '\\newenvironment{publicenv}{a}{b}',
      '\\newenvironment{internal@env}{a}{b}',
      '\\newtheorem{publicthm}{Theorem}',
      '\\newtheorem{internal@thm}{Theorem}',
    ]

    ctx.docs = {
      [ctx.docId]: {
        _id: ctx.docId,
        lines: ctx.lines,
      },
    }

    ctx.ProjectEntityHandler = {
      promises: {
        getAllDocs: sinon.stub().resolves(ctx.docs),
        getDoc: sinon.stub().resolves(ctx.docs[ctx.docId]),
      },
    }

    ctx.DocumentUpdaterHandler = {
      promises: {
        flushDocToMongo: sinon.stub().resolves(),
        flushProjectToMongo: sinon.stub().resolves(),
      },
    }

    ctx.packageMapping = {
      foo: [
        {
          caption: '\\bar',
          snippet: '\\bar',
          meta: 'foo-cmd',
          score: 12,
        },
        {
          caption: '\\bat[]{}',
          snippet: '\\bar[$1]{$2}',
          meta: 'foo-cmd',
          score: 10,
        },
      ],
      baz: [
        {
          caption: '\\longercommandtest{}',
          snippet: '\\longercommandtest{$1}',
          meta: 'baz-cmd',
          score: 50,
        },
      ],
    }

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )

    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler',
      () => ({
        default: ctx.DocumentUpdaterHandler,
      })
    )

    vi.doMock('../../../../app/src/Features/Metadata/packageMapping', () => ({
      default: ctx.packageMapping,
    }))

    ctx.MetaHandler = (await import(modulePath)).default
  })

  describe('getMetaForDoc', function () {
    it('should extract all the labels and packages', async function (ctx) {
      const result = await ctx.MetaHandler.promises.getMetaForDoc(
        ctx.projectId,
        ctx.docId
      )

      expect(result).to.deep.equal({
        labels: ['aaa', 'ccc', 'ddd', 'e,f,g', 'foo', 'lst:foo'],
        packages: {
          foo: ctx.packageMapping.foo,
          baz: ctx.packageMapping.baz,
        },
        packageNames: ['foo', 'bar', 'baz'],
        bibitems: ['ref1', 'ref2', 'ref3'],
        macros: ['\\publicmacro', '\\plainmacro'],
        environments: ['publicenv', 'publicthm'],
      })

      ctx.DocumentUpdaterHandler.promises.flushDocToMongo.should.be.calledWith(
        ctx.projectId,
        ctx.docId
      )

      ctx.ProjectEntityHandler.promises.getDoc.should.be.calledWith(
        ctx.projectId,
        ctx.docId
      )
    })
  })

  describe('getAllMetaForProject', function () {
    it('should extract all metadata', async function (ctx) {
      ctx.ProjectEntityHandler.promises.getAllDocs = sinon.stub().resolves({
        doc_one: {
          _id: 'id_one',
          lines: ['one', '\\label{aaa} two', 'three'],
        },
        doc_two: {
          _id: 'id_two',
          lines: ['four'],
        },
        doc_three: {
          _id: 'id_three',
          lines: ['\\label{bbb}', 'five six', 'seven eight \\label{ccc} nine'],
        },
        doc_four: {
          _id: 'id_four',
          lines: [
            '\\usepackage[width=\\textwidth]{baz}',
            '\\usepackage{amsmath}',
          ],
        },
        doc_five: {
          _id: 'id_five',
          lines: [
            '\\usepackage{foo,baz}',
            '\\usepackage[options=foo]{hello}',
            'some text',
            '\\section{this}\\label{sec:intro}',
            'In Section \\ref{sec:intro} we saw',
            'nothing',
          ],
        },
      })

      const result = await ctx.MetaHandler.promises.getAllMetaForProject(
        ctx.projectId
      )

      expect(result).to.deep.equal({
        id_one: {
          labels: ['aaa'],
          packages: {},
          packageNames: [],
          bibitems: [],
          macros: [],
          environments: [],
        },
        id_two: {
          labels: [],
          packages: {},
          packageNames: [],
          bibitems: [],
          macros: [],
          environments: [],
        },
        id_three: {
          labels: ['bbb', 'ccc'],
          packages: {},
          packageNames: [],
          bibitems: [],
          macros: [],
          environments: [],
        },
        id_four: {
          labels: [],
          packages: {
            baz: [
              {
                caption: '\\longercommandtest{}',
                snippet: '\\longercommandtest{$1}',
                meta: 'baz-cmd',
                score: 50,
              },
            ],
          },
          packageNames: ['baz', 'amsmath'],
          bibitems: [],
          macros: [],
          environments: [],
        },
        id_five: {
          labels: ['sec:intro'],
          packages: {
            foo: [
              {
                caption: '\\bar',
                snippet: '\\bar',
                meta: 'foo-cmd',
                score: 12,
              },
              {
                caption: '\\bat[]{}',
                snippet: '\\bar[$1]{$2}',
                meta: 'foo-cmd',
                score: 10,
              },
            ],
            baz: [
              {
                caption: '\\longercommandtest{}',
                snippet: '\\longercommandtest{$1}',
                meta: 'baz-cmd',
                score: 50,
              },
            ],
          },
          packageNames: ['foo', 'baz', 'hello'],
          bibitems: [],
          macros: [],
          environments: [],
        },
      })

      ctx.DocumentUpdaterHandler.promises.flushProjectToMongo.should.be.calledWith(
        ctx.projectId
      )

      ctx.ProjectEntityHandler.promises.getAllDocs.should.be.calledWith(
        ctx.projectId
      )
    })

    it('should ignore bibitems in .cls and .sty documents', async function (ctx) {
      ctx.ProjectEntityHandler.promises.getAllDocs = sinon.stub().resolves({
        '/main.tex': {
          _id: 'id_main',
          lines: ['\\bibitem{main-ref}'],
        },
        '/style/custom.sty': {
          _id: 'id_style',
          lines: ['\\bibitem{style-ref}'],
        },
        '/class/custom.cls': {
          _id: 'id_class',
          lines: ['\\bibitem{class-ref}'],
        },
      })

      const result = await ctx.MetaHandler.promises.getAllMetaForProject(
        ctx.projectId
      )

      expect(result.id_main.bibitems).to.deep.equal(['main-ref'])
      expect(result.id_style.bibitems).to.deep.equal([])
      expect(result.id_class.bibitems).to.deep.equal([])
    })

    it('should collect environments from .cls and .sty files and filter internal names', async function (ctx) {
      ctx.ProjectEntityHandler.promises.getAllDocs = sinon.stub().resolves({
        '/style/custom.sty': {
          _id: 'id_style',
          lines: [
            '\\newenvironment{styenv}{a}{b}',
            '\\newtheorem{stythm}{Theorem}',
            '\\newenvironment{sty@internal}{a}{b}',
            '\\newtheorem{sty@internalthm}{Theorem}',
          ],
        },
        '/class/custom.cls': {
          _id: 'id_class',
          lines: [
            '\\newenvironment{clsenv}{a}{b}',
            '\\newtheorem{clsthm}{Theorem}',
            '\\newenvironment{cls@internal}{a}{b}',
            '\\newtheorem{cls@internalthm}{Theorem}',
          ],
        },
      })

      const result = await ctx.MetaHandler.promises.getAllMetaForProject(
        ctx.projectId
      )

      expect(result.id_style.environments).to.deep.equal(['styenv', 'stythm'])
      expect(result.id_class.environments).to.deep.equal(['clsenv', 'clsthm'])
    })
  })
})
