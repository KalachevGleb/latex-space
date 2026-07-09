import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { ProjectListItem } from '../api/types'

export interface ActiveProjectInfo {
  projectId: string
  projectName: string
  conflicts: number
  offline: boolean
  /** активно real-time соединение — ручная синхронизация не нужна */
  live: boolean
}

type Node = ActiveNode | ActionNode | ProjectNode | InfoNode

class ActiveNode {
  constructor(readonly info: ActiveProjectInfo) {}
}

class ActionNode {
  constructor(
    readonly label: string,
    readonly icon: string,
    readonly command: string,
    readonly description?: string
  ) {}
}

class ProjectNode {
  constructor(readonly project: ProjectListItem, readonly isActive: boolean) {}
}

class InfoNode {
  constructor(readonly label: string) {}
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? `сегодня ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString()
}

const ACCESS_RU: Record<string, string> = {
  owner: 'владелец',
  readAndWrite: 'редактор',
  readOnly: 'чтение',
  review: 'рецензент',
}

/**
 * Панель «Проекты»: список проектов сервера (имя + дата изменения, без ID)
 * и действия текущего открытого проекта.
 * Пока пользователь не вошёл — provider пуст, и VSCode показывает
 * welcome-кнопку «Войти».
 */
export class ProjectsTreeProvider
  implements vscode.TreeDataProvider<Node>, vscode.Disposable
{
  private changeEmitter = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changeEmitter.event
  private projects: ProjectListItem[] = []
  private client?: LatexSpaceClient
  private active?: ActiveProjectInfo
  private loading = false
  private lastError?: string

  dispose(): void {
    this.changeEmitter.dispose()
  }

  setClient(client: LatexSpaceClient | undefined): void {
    this.client = client
    if (!client) this.projects = []
    void this.refresh()
  }

  setActive(info: ActiveProjectInfo | undefined): void {
    this.active = info
    this.changeEmitter.fire()
  }

  async refresh(): Promise<void> {
    if (!this.client) {
      this.changeEmitter.fire()
      return
    }
    this.loading = true
    this.changeEmitter.fire()
    try {
      this.projects = await this.client.listProjects()
      this.projects.sort((a, b) =>
        (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? '')
      )
      this.lastError = undefined
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
      this.changeEmitter.fire()
    }
  }

  getChildren(element?: Node): Node[] {
    if (element instanceof ActiveNode) {
      const nodes = [
        new ActionNode('Компилировать', 'play', 'latexspace.compile'),
        new ActionNode('Показать PDF', 'file-pdf', 'latexspace.showPdf'),
      ]
      if (element.info.offline) {
        nodes.push(
          new ActionNode(
            'Оффлайн-режим — подключиться…',
            'plug',
            'latexspace.goOnline'
          )
        )
      } else if (!element.info.live) {
        // ручная синхронизация нужна только вне live-режима
        nodes.push(
          new ActionNode('Синхронизировать', 'sync', 'latexspace.syncNow'),
          new ActionNode(
            'Полная отправка на сервер…',
            'cloud-upload',
            'latexspace.pushAll'
          )
        )
      }
      if (!element.info.offline && element.info.conflicts > 0) {
        nodes.push(
          new ActionNode(
            `Конфликты (${element.info.conflicts})…`,
            'warning',
            'latexspace.showConflicts'
          )
        )
      }
      return nodes
    }
    if (element) return []

    // корень
    if (!this.client) return []
    const roots: Node[] = []
    if (this.active) roots.push(new ActiveNode(this.active))
    if (this.loading && this.projects.length === 0) {
      roots.push(new InfoNode('Загрузка…'))
    } else if (this.lastError && this.projects.length === 0) {
      roots.push(new InfoNode(`Ошибка: ${this.lastError}`))
    } else if (this.projects.length === 0) {
      roots.push(new InfoNode('Проектов нет'))
    } else {
      for (const p of this.projects) {
        roots.push(new ProjectNode(p, p.id === this.active?.projectId))
      }
    }
    return roots
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element instanceof ActiveNode) {
      const item = new vscode.TreeItem(
        element.info.projectName,
        vscode.TreeItemCollapsibleState.Expanded
      )
      item.description = element.info.offline
        ? 'текущий · оффлайн'
        : element.info.live
          ? 'текущий · live'
          : 'текущий проект'
      item.iconPath = new vscode.ThemeIcon(
        element.info.offline
          ? 'cloud-offline'
          : element.info.live
            ? 'broadcast'
            : 'root-folder-opened',
        new vscode.ThemeColor('charts.blue')
      )
      item.contextValue = 'lsActiveProject'
      return item
    }
    if (element instanceof ActionNode) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      )
      item.iconPath = new vscode.ThemeIcon(element.icon)
      item.description = element.description
      item.command = { command: element.command, title: element.label }
      item.contextValue = 'lsAction'
      return item
    }
    if (element instanceof ProjectNode) {
      const p = element.project
      const item = new vscode.TreeItem(
        p.name,
        vscode.TreeItemCollapsibleState.None
      )
      const access = ACCESS_RU[p.accessLevel] ?? p.accessLevel
      item.description = [formatDate(p.lastUpdated), access]
        .filter(Boolean)
        .join(' · ')
      item.iconPath = new vscode.ThemeIcon(
        element.isActive ? 'check' : 'notebook'
      )
      const owner = p.owner?.email ? `Владелец: ${p.owner.email}\n` : ''
      item.tooltip = `${p.name}\n${owner}Изменён: ${formatDate(p.lastUpdated) || '—'}\nДоступ: ${access}`
      item.contextValue = 'lsProject'
      item.command = {
        command: 'latexspace.openProjectItem',
        title: 'Открыть проект',
        arguments: [p.id, p.name],
      }
      return item
    }
    const item = new vscode.TreeItem(
      (element as InfoNode).label,
      vscode.TreeItemCollapsibleState.None
    )
    item.iconPath = new vscode.ThemeIcon('info')
    return item
  }
}
