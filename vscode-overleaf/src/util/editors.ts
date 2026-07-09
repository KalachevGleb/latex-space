import * as vscode from 'vscode'

/**
 * Показать документ, не создавая дублей вкладок:
 * если файл уже открыт в какой-то группе — активировать ту вкладку;
 * иначе открыть в первой (левой) группе, а не в активной
 * (активной может быть заблокированная группа с PDF).
 */
export async function revealDocumentSmart(
  uri: vscode.Uri,
  selection?: vscode.Range
): Promise<vscode.TextEditor> {
  let viewColumn: vscode.ViewColumn | undefined
  outer: for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === uri.toString()
      ) {
        viewColumn = group.viewColumn
        break outer
      }
    }
  }
  const doc = await vscode.workspace.openTextDocument(uri)
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: viewColumn ?? vscode.ViewColumn.One,
    preview: false,
    preserveFocus: false,
  })
  if (selection) {
    editor.selection = new vscode.Selection(selection.start, selection.end)
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenter)
  }
  return editor
}
