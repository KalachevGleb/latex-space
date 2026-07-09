export interface ProjectListItem {
  id: string
  name: string
  accessLevel: string
  lastUpdated?: string
  archived?: boolean
  trashed?: boolean
  owner?: { email?: string; firstName?: string; lastName?: string }
  lastUpdatedBy?: { email?: string; firstName?: string; lastName?: string }
}

export interface SyncPdfPosition {
  page: number
  h: number
  v: number
  width: number
  height: number
}

export interface SyncCodePosition {
  file: string
  line: number
  column: number
}

export interface ProjectEntity {
  path: string // с ведущим "/", например "/main.tex"
  type: 'doc' | 'file'
}

export interface CompileOutputFile {
  url: string // путь на web, например /project/<id>/user/<uid>/build/<buildId>/output/output.pdf
  path: string // например "output.pdf"
  type: string
  build: string
}

export interface CompileResponse {
  status: string // success | failure | error | timedout | ...
  outputFiles?: CompileOutputFile[]
  clsiServerId?: string
  buildId?: string
  compileGroup?: string
  validationProblems?: unknown
}

export interface CommentAuthor {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  alias?: string
}

/** Автор в ответе /threads (id внутри объекта user). */
export type CommentAuthorInfo = CommentAuthor

export interface CommentMessage {
  author: CommentAuthor | null
  text: string
  timestamp: string
}

export interface ServerComment {
  thread_id: string
  file: string // путь документа с ведущим "/"
  position: { start: number; end: number }
  text: string // процитированный (закомментированный) фрагмент
  messages: CommentMessage[]
  resolved: boolean
}

export interface DocRanges {
  id: string // docId
  ranges: {
    comments: Array<{ op?: { t?: string; p?: number; c?: string }; resolved?: boolean }>
    changes: unknown[]
  }
}

export interface HistoryUpdate {
  fromV: number
  toV: number
}

export interface UploadByPathResult {
  success: boolean
  entity_id?: string
  entity_type?: string
  hash?: string
  path?: string
  isNew?: boolean
  error?: string
}

export interface SyncFromZipResult {
  success: boolean
  added?: unknown
  updated?: unknown
  deleted?: unknown
  error?: string
}
