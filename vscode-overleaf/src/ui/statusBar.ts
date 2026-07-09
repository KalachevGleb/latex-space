import * as vscode from 'vscode'
import { CompileManager } from '../compile/compiler'
import { SyncManager, SyncStatusInfo } from '../sync/syncManager'

/**
 * Кнопка «Компилировать» и индикатор синхронизации в статус-баре.
 */
export class StatusBarUi implements vscode.Disposable {
  private compileItem: vscode.StatusBarItem
  private syncItem: vscode.StatusBarItem
  private subs: vscode.Disposable[] = []
  private live = false
  private lastInfo?: SyncStatusInfo

  constructor(
    sync: SyncManager,
    compiler: CompileManager,
    private offlineMode = false
  ) {
    this.compileItem = vscode.window.createStatusBarItem(
      'latexspace.compile',
      vscode.StatusBarAlignment.Left,
      100
    )
    this.compileItem.name = 'LatexSpace: компиляция'
    this.syncItem = vscode.window.createStatusBarItem(
      'latexspace.sync',
      vscode.StatusBarAlignment.Left,
      99
    )
    this.syncItem.name = 'LatexSpace: синхронизация'
    this.syncItem.command = 'latexspace.syncMenu'

    this.setCompileIdle()
    this.applySync(sync.getStatusInfo())
    this.compileItem.show()
    this.syncItem.show()

    this.subs.push(
      compiler.onDidChangeState(state => {
        if (state === 'compiling') {
          this.compileItem.text = '$(sync~spin) Компиляция…'
          this.compileItem.tooltip = 'Нажмите, чтобы остановить'
          this.compileItem.command = 'latexspace.stopCompile'
        } else {
          this.setCompileIdle()
        }
      }),
      sync.onDidChangeStatus(info => this.applySync(info))
    )
  }

  dispose(): void {
    this.compileItem.dispose()
    this.syncItem.dispose()
    for (const s of this.subs) s.dispose()
  }

  private setCompileIdle(): void {
    this.compileItem.text = '$(play) Компилировать'
    this.compileItem.tooltip =
      'LatexSpace: скомпилировать проект (Cmd/Ctrl+Alt+B)'
    this.compileItem.command = 'latexspace.compile'
    this.compileItem.backgroundColor = undefined
  }

  /** Индикатор live-подключения (real-time OT). */
  setLive(live: boolean): void {
    this.live = live
    if (this.lastInfo) this.applySync(this.lastInfo)
  }

  private applySync(info: SyncStatusInfo): void {
    this.lastInfo = info
    if (this.offlineMode) {
      this.syncItem.text = '$(cloud-offline) LatexSpace: оффлайн'
      this.syncItem.tooltip =
        'Оффлайн-режим: синхронизация отключена. Нажмите для меню.'
      this.syncItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      )
      return
    }
    switch (info.status) {
      case 'syncing':
        this.syncItem.text = '$(sync~spin) LatexSpace'
        this.syncItem.tooltip = 'Синхронизация…'
        this.syncItem.backgroundColor = undefined
        break
      case 'pending':
        this.syncItem.text = `$(cloud-upload) LatexSpace (${info.pendingPushes})`
        this.syncItem.tooltip = `Ожидают отправки: ${info.pendingPushes}`
        this.syncItem.backgroundColor = undefined
        break
      case 'conflict':
        this.syncItem.text = `$(warning) LatexSpace: конфликты (${info.conflicts})`
        this.syncItem.tooltip =
          'Есть конфликты синхронизации — нажмите, чтобы разрешить'
        this.syncItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        )
        break
      case 'offline':
        this.syncItem.text = '$(cloud-offline) LatexSpace'
        this.syncItem.tooltip = `Нет связи с сервером${info.lastError ? `: ${info.lastError}` : ''}`
        this.syncItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        )
        break
      default:
        if (this.live) {
          this.syncItem.text = '$(broadcast) LatexSpace: live'
          this.syncItem.tooltip =
            'Реальное время: правки синхронизируются по мере набора'
        } else {
          this.syncItem.text = '$(check) LatexSpace'
          this.syncItem.tooltip = `Синхронизировано (версия ${info.lastSyncedVersion})`
        }
        this.syncItem.backgroundColor = undefined
    }
  }
}
