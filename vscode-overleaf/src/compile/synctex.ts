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
      const p = new vscode.Position(lineIdx, colIdx)
      await revealDocumentSmart(vscode.Uri.file(abs), new vscode.Range(p, p))
    } catch (err) {
      this.log(`backward: ${err instanceof Error ? err.message : err}`)
      vscode.window.setStatusBarMessage(
        'SyncTeX: переход не удался — скомпилируйте проект',
        4000
      )
    }
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
    return new Promise((resolve, reject) => {
      const child = spawn('synctex', args, { cwd: this.state.rootDir })
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
    return [
      {
        file: rec.Input,
        line: parseInt(rec.Line || '1', 10),
        column: Math.max(0, parseInt(rec.Column || '0', 10)),
      },
    ]
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
