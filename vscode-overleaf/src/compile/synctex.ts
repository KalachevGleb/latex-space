import { spawn } from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { revealDocumentSmart } from '../util/editors'
import { ProjectMeta, ProjectState } from '../sync/state'
import { CompileManager } from './compiler'
import { PdfPreview, PdfSyncClick } from './pdfPreview'

/**
 * SyncTeX в обе стороны.
 * Серверная компиляция — через API /sync/code и /sync/pdf;
 * локальная — через утилиту `synctex` из TeX Live (файл в .build).
 */
export class SyncTexService {
  constructor(
    private client: LatexSpaceClient,
    private state: ProjectState,
    private meta: ProjectMeta,
    private compiler: CompileManager,
    private preview: PdfPreview,
    private output: vscode.OutputChannel
  ) {}

  private log(msg: string): void {
    this.output.appendLine(`[synctex] ${msg}`)
  }

  /** Код → PDF: показать позицию курсора в PDF. */
  async forward(editor: vscode.TextEditor): Promise<void> {
    const rel = this.relOf(editor.document.uri)
    if (!rel || !rel.endsWith('.tex')) return
    const line = editor.selection.active.line + 1
    const column = editor.selection.active.character + 1
    try {
      // режим последней компиляции: локальный PDF ↔ локальный synctex,
      // серверный PDF ↔ серверный SyncTeX API
      const positions =
        (this.compiler.lastMode ?? (await this.compiler.resolveMode())) ===
        'server'
          ? await this.syncServerForward(rel, line, column)
          : await this.forwardLocal(rel, line, column)
      if (!positions.length) {
        vscode.window.setStatusBarMessage(
          'SyncTeX: позиция не найдена (скомпилируйте проект)',
          4000
        )
        return
      }
      await this.preview.highlight(positions[0])
    } catch (err) {
      this.log(`forward: ${err instanceof Error ? err.message : err}`)
      vscode.window.setStatusBarMessage(
        'SyncTeX: не удалось найти позицию — скомпилируйте проект',
        4000
      )
    }
  }

  /** PDF → код: перейти к исходнику по клику в PDF. */
  async backward(click: PdfSyncClick): Promise<void> {
    try {
      const positions =
        (this.compiler.lastMode ?? (await this.compiler.resolveMode())) ===
        'server'
          ? await this.syncServerBackward(click)
          : await this.backwardLocal(click)
      const pos = positions[0]
      if (!pos?.file) {
        vscode.window.setStatusBarMessage('SyncTeX: исходник не найден', 4000)
        return
      }
      let rel = pos.file.replace(/^(\.\/)+/, '').replace(/\/\.\//g, '/')
      // локальный synctex может вернуть абсолютный путь
      if (path.isAbsolute(rel)) {
        rel = path.relative(this.state.rootDir, rel).split(path.sep).join('/')
      }
      if (rel.startsWith('..')) return
      const abs = path.join(this.state.rootDir, rel)
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs))
      const lineIdx = Math.min(
        Math.max(0, (pos.line || 1) - 1),
        doc.lineCount - 1
      )
      const colIdx = Math.max(0, (pos.column || 1) - 1)
      // доводка по слову под курсором мыши: один запуск synctex, затем
      // поиск этого слова в соседних строках исходника; найдено —
      // выделяем его, нет — используем позицию synctex как есть
      const found = this.findWordNear(doc, click.word, lineIdx, colIdx)
      const range = found
        ? new vscode.Range(
            found.line,
            found.col,
            found.line,
            found.col + (click.word?.length ?? 0)
          )
        : new vscode.Range(
            new vscode.Position(lineIdx, colIdx),
            new vscode.Position(lineIdx, colIdx)
          )
      await revealDocumentSmart(vscode.Uri.file(abs), range)
    } catch (err) {
      this.log(`backward: ${err instanceof Error ? err.message : err}`)
      vscode.window.setStatusBarMessage(
        'SyncTeX: переход не удался — скомпилируйте проект',
        4000
      )
    }
  }

  /**
   * Найти слово в окне ±3 строк от позиции synctex (сначала сама строка,
   * затем по расширяющемуся радиусу); на строке — вхождение, ближайшее
   * к колонке synctex.
   */
  private findWordNear(
    doc: vscode.TextDocument,
    word: string | undefined,
    lineIdx: number,
    colIdx: number
  ): { line: number; col: number } | undefined {
    const w = word?.trim()
    if (!w || w.length < 2) return undefined
    const nearestInLine = (line: number): number => {
      const text = doc.lineAt(line).text
      let best = -1
      let bestDist = Infinity
      for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) {
        const dist = Math.abs(i - colIdx)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      return best
    }
    for (let dl = 0; dl <= 3; dl++) {
      for (const cand of dl === 0 ? [lineIdx] : [lineIdx + dl, lineIdx - dl]) {
        if (cand < 0 || cand >= doc.lineCount) continue
        const col = nearestInLine(cand)
        if (col !== -1) return { line: cand, col }
      }
    }
    return undefined
  }

  private serverSyncParams(): {
    editorId: string
    buildId: string
    clsiServerId?: string
  } {
    if (!this.compiler.lastBuildId) {
      throw new Error('нет buildId — сначала скомпилируйте проект')
    }
    return {
      editorId: this.compiler.editorId,
      buildId: this.compiler.lastBuildId,
      clsiServerId: this.compiler.lastClsiServerId,
    }
  }

  private syncServerForward(rel: string, line: number, column: number) {
    return this.client.syncCode(
      this.meta.projectId,
      rel,
      line,
      column,
      this.serverSyncParams()
    )
  }

  private syncServerBackward(click: PdfSyncClick) {
    return this.client.syncPdf(
      this.meta.projectId,
      click.page,
      click.h,
      click.v,
      this.serverSyncParams()
    )
  }

  private relOf(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null
    const rel = path
      .relative(this.state.rootDir, uri.fsPath)
      .split(path.sep)
      .join('/')
    if (!rel || rel.startsWith('..')) return null
    return rel
  }

  // ---------- локальный synctex CLI ----------

  private localPdfPath(): string | null {
    const root = this.compiler.lastLocalRoot || this.meta.rootFile
    if (!root) return null
    return path.join(this.state.outDir, path.basename(root, '.tex') + '.pdf')
  }

  private runSynctex(args: string[]): Promise<string> {
    // cwd — каталог последней локальной компиляции (может быть теневым)
    const cwd = this.compiler.lastCompileCwd ?? this.state.rootDir
    return new Promise((resolve, reject) => {
      const child = spawn('synctex', args, { cwd })
      let out = ''
      let err = ''
      child.stdout.on('data', d => (out += d.toString()))
      child.stderr.on('data', d => (err += d.toString()))
      child.on('error', e => reject(new Error(`synctex не запустился: ${e.message}`)))
      child.on('close', code =>
        code === 0 ? resolve(out) : reject(new Error(err || `synctex: код ${code}`))
      )
    })
  }

  private async forwardLocal(rel: string, line: number, column: number) {
    const pdf = this.localPdfPath()
    if (!pdf) throw new Error('нет локальной сборки')
    // компиляция шла по «развёрнутой» копии — пересчитать позицию
    const ex = this.compiler.explodedFor(rel)
    if (ex) {
      const mapped = ex.newLineCol(line, Math.max(0, column - 1))
      line = mapped.line1
      column = mapped.col0 + 1
    }
    const out = await this.runSynctex([
      'view',
      '-i',
      `${line}:${column}:${rel}`,
      '-o',
      pdf,
    ])
    const rec = this.parseRecord(out, ['Page', 'h', 'v', 'W', 'H'])
    if (!rec.Page) return []
    return [
      {
        page: parseInt(rec.Page, 10),
        h: parseFloat(rec.h || '0'),
        v: parseFloat(rec.v || '0'),
        width: parseFloat(rec.W || '0'),
        height: parseFloat(rec.H || '0'),
      },
    ]
  }

  private async backwardLocal(click: PdfSyncClick) {
    const pdf = this.localPdfPath()
    if (!pdf) throw new Error('нет локальной сборки')
    const out = await this.runSynctex([
      'edit',
      '-o',
      `${click.page}:${click.h.toFixed(2)}:${click.v.toFixed(2)}:${pdf}`,
    ])
    const rec = this.parseRecord(out, ['Input', 'Line', 'Column'])
    if (!rec.Input) return []
    let file = rec.Input
    let line = parseInt(rec.Line || '1', 10)
    let column = Math.max(0, parseInt(rec.Column || '0', 10))
    // путь может указывать в теневую копию — вернуть к исходнику
    const cwd = this.compiler.lastCompileCwd
    if (cwd && cwd !== this.state.rootDir) {
      const abs = path.isAbsolute(file) ? file : path.join(cwd, file)
      const rel = path.relative(cwd, abs).split(path.sep).join('/')
      if (!rel.startsWith('..')) {
        const ex = this.compiler.explodedFor(rel)
        if (ex) {
          const mapped = ex.origLineCol(line, column)
          line = mapped.line1
          column = mapped.col0
        }
        file = rel
      }
    }
    return [{ file, line, column }]
  }

  /** Разобрать первую запись вывода synctex (строки "Key:value"). */
  private parseRecord(
    out: string,
    keys: string[]
  ): Record<string, string | undefined> {
    const rec: Record<string, string | undefined> = {}
    for (const line of out.split(/\r?\n/)) {
      const m = /^(\w+):(.*)$/.exec(line.trim())
      if (!m) continue
      const key = m[1]
      if (keys.includes(key) && rec[key] === undefined) {
        rec[key] = m[2].trim()
      }
      // первая запись закончилась — достаточно
      if (keys.every(k => rec[k] !== undefined)) break
    }
    return rec
  }
}
