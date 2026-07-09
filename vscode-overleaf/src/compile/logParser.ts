import * as path from 'path'
import * as vscode from 'vscode'

export interface LatexIssue {
  file: string // относительный путь или имя файла из лога
  line: number // 1-based
  message: string
  severity: vscode.DiagnosticSeverity
}

/**
 * Парсер лога LaTeX в режиме -file-line-error:
 *   ./main.tex:12: Undefined control sequence.
 * плюс предупреждения вида "LaTeX Warning: ... on input line 34."
 */
export function parseLatexLog(log: string): LatexIssue[] {
  const issues: LatexIssue[] = []
  const lines = log.split(/\r?\n/)

  const errRe = /^(?:\.\/)?([^:\s][^:]*\.\w+):(\d+):\s*(.*)$/
  const warnRe = /^(?:LaTeX|Package|Class)(?:\s+\S+)?\s+Warning:\s*(.*)$/i

  // отслеживаем текущий файл по скобочной структуре лога (грубо)
  const fileStack: string[] = []
  const openRe = /\((\.\/)?([^\s()]+\.(?:tex|sty|cls|bib|def|cfg|ltx))/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const err = errRe.exec(line)
    if (err) {
      let message = err[3].trim()
      // сообщение может продолжаться на следующих строках до "l.<num>" или пустой
      let j = i + 1
      while (
        j < lines.length &&
        lines[j] &&
        !lines[j].startsWith('l.') &&
        !errRe.test(lines[j]) &&
        j - i < 4
      ) {
        message += ' ' + lines[j].trim()
        j++
      }
      issues.push({
        file: err[1],
        line: parseInt(err[2], 10),
        message: message || 'Ошибка LaTeX',
        severity: vscode.DiagnosticSeverity.Error,
      })
      continue
    }

    const warn = warnRe.exec(line)
    if (warn) {
      let message = warn[1].trim()
      let j = i + 1
      while (j < lines.length && lines[j].trim() && j - i < 3 && !warnRe.test(lines[j])) {
        message += ' ' + lines[j].trim()
        j++
      }
      const lineMatch = /on input line (\d+)/.exec(message)
      issues.push({
        file: fileStack[fileStack.length - 1] ?? '',
        line: lineMatch ? parseInt(lineMatch[1], 10) : 1,
        message,
        severity: vscode.DiagnosticSeverity.Warning,
      })
      continue
    }

    // обновление стека файлов
    let m: RegExpExecArray | null
    openRe.lastIndex = 0
    while ((m = openRe.exec(line))) {
      fileStack.push(m[2])
    }
    for (const ch of line) {
      if (ch === ')') fileStack.pop()
    }
  }
  return issues
}

/** Превратить проблемы из лога в диагностику VSCode. */
export function issuesToDiagnostics(
  issues: LatexIssue[],
  rootDir: string,
  collection: vscode.DiagnosticCollection
): number {
  collection.clear()
  const byFile = new Map<string, vscode.Diagnostic[]>()
  let count = 0
  for (const issue of issues) {
    if (!issue.file) continue
    const rel = issue.file.replace(/^\.\//, '')
    if (rel.includes('..')) continue
    const abs = path.join(rootDir, rel)
    const lineIdx = Math.max(0, issue.line - 1)
    const diag = new vscode.Diagnostic(
      new vscode.Range(lineIdx, 0, lineIdx, 1000),
      issue.message,
      issue.severity
    )
    diag.source = 'LatexSpace LaTeX'
    const key = vscode.Uri.file(abs).toString()
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key)!.push(diag)
    count++
  }
  for (const [uriStr, diags] of byFile) {
    collection.set(vscode.Uri.parse(uriStr), diags)
  }
  return count
}
