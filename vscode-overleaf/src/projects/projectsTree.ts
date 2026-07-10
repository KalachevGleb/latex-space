import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { ProjectListItem } from '../api/types'
import { getConfig } from '../config'
import { LATEXSPACE_DIR } from '../sync/state'
import { IgnoreMatcher } from '../util/glob'

export interface ActiveProjectInfo {
  projectId: string
  projectName: string
  rootDir: string
  conflicts: number
  offline: boolean
  /** активно real-time соединение — ручная синхронизация не нужна */
  live: boolean
}

type Node =
  | ActiveNode
  | ActionNode
  | ProjectNode
  | InfoNode
  | FolderNode
  | FileNode
  | ProjectsGroupNode

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

class FolderNode {
  constructor(readonly abs: string, readonly name: string) {}
}

class FileNode {
  constructor(readonly abs: string, readonly name: string) {}
}

/** Свёрнутая группа «Другие проекты» под файлами текущего. */
class ProjectsGroupNode {}

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

  /** Дёрнуть перерисовку (например, при изменении файлов на диске). */
  poke(): void {
    this.changeEmitter.fire()
  }

  private filesMatcher(): IgnoreMatcher {
    const cfg = getConfig()
    return new IgnoreMatcher([
      `${LATEXSPACE_DIR}/**`,
      ...cfg.ignore,
      ...cfg.hiddenFilePatterns,
    ])
  }

  /** Файлы и папки каталога проекта (как в проводнике: папки сверху). */
  private async listDir(dir: string, rootDir: string): Promise<Node[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const matcher = this.filesMatcher()
    const folders: FolderNode[] = []
    const files: FileNode[] = []
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const abs = path.join(dir, e.name)
      const rel = path.relative(rootDir, abs).split(path.sep).join('/')
      if (e.isDirectory()) {
        folders.push(new FolderNode(abs, e.name))
      } else if (!matcher.ignoresFile(rel)) {
        files.push(new FileNode(abs, e.name))
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    return [...folders, ...files]
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element instanceof FolderNode) {
      return this.listDir(element.abs, this.active?.rootDir ?? element.abs)
    }
    if (element instanceof ProjectsGroupNode) {
      if (this.projects.length === 0) return [new InfoNode('Проектов нет')]
      return this.projects.map(
        p => new ProjectNode(p, p.id === this.active?.projectId)
      )
    }
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

    // проект открыт: показываем ЕГО файлы, а список проектов — свёрнутой
    // группой ниже (не приходится прыгать в проводник и обратно)
    if (this.active) {
      return [
        new ActiveNode(this.active),
        ...(await this.listDir(this.active.rootDir, this.active.rootDir)),
        new ProjectsGroupNode(),
      ]
    }

    const roots: Node[] = []
    if (this.loading && this.projects.length === 0) {
      roots.push(new InfoNode('Загрузка…'))
    } else if (this.lastError && this.projects.length === 0) {
      roots.push(new InfoNode(`Ошибка: ${this.lastError}`))
    } else if (this.projects.length === 0) {
      roots.push(new InfoNode('Проектов нет'))
    } else {
      for (const p of this.projects) {
        roots.push(new ProjectNode(p, false))
      }
    }
    return roots
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element instanceof FolderNode) {
      const item = new vscode.TreeItem(
        vscode.Uri.file(element.abs),
        vscode.TreeItemCollapsibleState.Collapsed
      )
      item.contextValue = 'lsFolder'
      return item
    }
    if (element instanceof FileNode) {
      const item = new vscode.TreeItem(
        vscode.Uri.file(element.abs),
        vscode.TreeItemCollapsibleState.None
      )
      item.command = {
        command: 'vscode.open',
        title: 'Открыть файл',
        arguments: [vscode.Uri.file(element.abs)],
      }
      item.contextValue = 'lsFile'
      return item
    }
    if (element instanceof ProjectsGroupNode) {
      const item = new vscode.TreeItem(
        'Другие проекты',
        vscode.TreeItemCollapsibleState.Collapsed
      )
      item.description = String(this.projects.length || '')
      item.iconPath = new vscode.ThemeIcon('notebook')
      item.contextValue = 'lsProjectsGroup'
      return item
    }
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
