import * as fs from 'fs/promises'
import * as path from 'path'
import { IgnoreMatcher } from '../util/glob'
import {
  readFileOrNull,
  removeFileAndEmptyDirs,
  walkDir,
  writeFileEnsuringDir,
} from '../util/fsutil'

export const LATEXSPACE_DIR = '.latexspace'
export const BUILD_DIR = '.build'
export const PROJECT_META_FILE = 'project.json'

export interface ProjectMeta {
  serverUrl: string
  projectId: string
  projectName: string
  lastSyncedVersion: number
  /** учётная запись, под которой привязан проект */
  userEmail?: string
  rootFile?: string
  /** открыть главный файл при первой активации */
  openMainOnActivate?: boolean
}

/**
 * Локальное состояние проекта:
 *  - .latexspace/project.json — метаданные привязки;
 *  - .latexspace/base/**      — «базовая» копия (последнее состояние, совпадающее с сервером);
 *  - .latexspace/remote/**    — серверные версии конфликтующих файлов (для diff);
 *  - .latexspace/trash/**     — локальные копии файлов, удалённых при синхронизации;
 *  - .build/**                — результаты компиляции (не синхронизируются).
 */
export class ProjectState {
  readonly stateDir: string
  readonly baseDir: string
  readonly remoteDir: string
  readonly trashDir: string
  readonly outDir: string

  constructor(readonly rootDir: string) {
    this.stateDir = path.join(rootDir, LATEXSPACE_DIR)
    this.baseDir = path.join(this.stateDir, 'base')
    this.remoteDir = path.join(this.stateDir, 'remote')
    this.trashDir = path.join(this.stateDir, 'trash')
    this.outDir = path.join(rootDir, BUILD_DIR)
  }

  get metaPath(): string {
    return path.join(this.stateDir, PROJECT_META_FILE)
  }

  static async load(
    rootDir: string
  ): Promise<{ state: ProjectState; meta: ProjectMeta } | null> {
    const state = new ProjectState(rootDir)
    const raw = await readFileOrNull(state.metaPath)
    if (!raw) return null
    try {
      const meta = JSON.parse(raw.toString('utf8')) as ProjectMeta
      if (!meta.projectId || !meta.serverUrl) return null
      return { state, meta }
    } catch {
      return null
    }
  }

  async saveMeta(meta: ProjectMeta): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true })
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2))
  }

  // ---------- базовая копия ----------

  basePath(rel: string): string {
    return path.join(this.baseDir, rel)
  }

  localPath(rel: string): string {
    return path.join(this.rootDir, rel)
  }

  async readBase(rel: string): Promise<Buffer | null> {
    return readFileOrNull(this.basePath(rel))
  }

  async writeBase(rel: string, content: Buffer): Promise<void> {
    await writeFileEnsuringDir(this.basePath(rel), content)
  }

  async deleteBase(rel: string): Promise<void> {
    await removeFileAndEmptyDirs(this.basePath(rel), this.baseDir)
  }

  async listBase(): Promise<string[]> {
    // в base никогда не бывает игнорируемых файлов — matcher пустой
    return walkDir(this.baseDir, new IgnoreMatcher([]))
  }

  /** Полностью заменить базовую копию заданным набором файлов. */
  async resetBase(files: Map<string, Buffer>): Promise<void> {
    await fs.rm(this.baseDir, { recursive: true, force: true })
    for (const [rel, buf] of files) {
      await this.writeBase(rel, buf)
    }
  }

  // ---------- прочее ----------

  async writeRemoteCopy(rel: string, content: Buffer): Promise<string> {
    const p = path.join(this.remoteDir, rel)
    await writeFileEnsuringDir(p, content)
    return p
  }

  async moveToTrash(rel: string): Promise<void> {
    const local = this.localPath(rel)
    const content = await readFileOrNull(local)
    if (content) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await writeFileEnsuringDir(path.join(this.trashDir, stamp, rel), content)
    }
    await removeFileAndEmptyDirs(local, this.rootDir)
  }
}
