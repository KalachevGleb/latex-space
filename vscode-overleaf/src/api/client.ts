import {
  CommentAuthorInfo,
  CommentMessage,
  CompileResponse,
  DocRanges,
  ProjectEntity,
  ProjectListItem,
  ServerComment,
  SyncCodePosition,
  SyncFromZipResult,
  SyncPdfPosition,
  UploadByPathResult,
} from './types'

export interface ClientOptions {
  serverUrl: string
  /** учётные данные пользователя LatexSpace (вход как в браузере) */
  email: string
  password: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Ошибка сети (сервер недоступен) — отличаем от ошибок API. */
export class ConnectionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'ConnectionError'
  }
}

interface RequestOptions {
  method?: string
  query?: Record<string, string | undefined>
  jsonBody?: unknown
  formData?: FormData
  /** Ожидаемый формат ответа */
  expect?: 'json' | 'buffer' | 'none'
  timeoutMs?: number
  /** служебный флаг: не пытаться логиниться (для самих запросов логина) */
  noAuth?: boolean
  /** служебный флаг: повторный запрос после релогина */
  isRetry?: boolean
}

/**
 * Клиент API LatexSpace от имени обычного пользователя:
 * cookie-сессия + CSRF-токен, автоматический повторный вход при истечении.
 */
export class LatexSpaceClient {
  /** cookie-jar: имя → значение */
  private cookies = new Map<string, string>()
  private csrfToken?: string
  private loginPromise?: Promise<void>

  constructor(private opts: ClientOptions) {}

  get serverUrl(): string {
    return this.opts.serverUrl.replace(/\/+$/, '')
  }

  // ---------- cookie/CSRF ----------

  private captureCookies(res: Response): void {
    const setCookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie === 'function'
        ? (
            res.headers as unknown as { getSetCookie: () => string[] }
          ).getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie') as string]
          : []
    for (const sc of setCookies) {
      const pair = sc.split(';', 1)[0]
      const eq = pair.indexOf('=')
      if (eq > 0) {
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (value === '') this.cookies.delete(name)
        else this.cookies.set(name, value)
      }
    }
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private resetSession(): void {
    this.cookies.clear()
    this.csrfToken = undefined
  }

  /** Вход: CSRF → /login → новый CSRF. */
  private async login(): Promise<void> {
    const { email, password } = this.opts
    if (!email || !password) {
      throw new AuthError(
        'Не заданы e-mail и пароль пользователя LatexSpace'
      )
    }
    this.resetSession()
    const preToken = (
      await this.rawRequest<Buffer>('/dev/csrf', {
        noAuth: true,
        expect: 'buffer',
      })
    ).toString('utf8')
    const res = await this.rawFetch('/login', {
      method: 'POST',
      jsonBody: { email, password, _csrf: preToken },
      noAuth: true,
      extraHeaders: { 'x-csrf-token': preToken },
    })
    this.captureCookies(res)
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '')
      let msg = 'Неверный e-mail или пароль'
      try {
        const j = JSON.parse(text)
        msg = j?.message?.text || j?.message || msg
        if (typeof msg === 'object') msg = JSON.stringify(msg)
      } catch {
        /* не JSON */
      }
      throw new AuthError(`Не удалось войти: ${msg}`)
    }
    if (res.status >= 400) {
      const text = await res.text().catch(() => '')
      throw new AuthError(
        `Не удалось войти (HTTP ${res.status}): ${text.slice(0, 200)}`
      )
    }
    // успех: 200 с {redir} или 302 на /project
    await res.text().catch(() => '')
    this.csrfToken = (
      await this.rawRequest<Buffer>('/dev/csrf', {
        noAuth: true,
        expect: 'buffer',
      })
    ).toString('utf8')
    if (!this.cookieHeader()) {
      throw new AuthError(
        'Сервер не выдал сессионную cookie после входа'
      )
    }
  }

  private ensureSession(): Promise<void> {
    if (this.cookies.size > 0 && this.csrfToken) return Promise.resolve()
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = undefined
      })
    }
    return this.loginPromise
  }

  // ---------- HTTP ----------

  private buildHeaders(
    method: string,
    extra?: Record<string, string>
  ): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json', ...extra }
    const cookie = this.cookieHeader()
    if (cookie) h.Cookie = cookie
    if (method !== 'GET' && method !== 'HEAD' && this.csrfToken) {
      h['x-csrf-token'] = this.csrfToken
    }
    return h
  }

  private async rawFetch(
    path: string,
    options: RequestOptions & { extraHeaders?: Record<string, string> }
  ): Promise<Response> {
    const url = new URL(this.serverUrl + path)
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v)
    }
    const method = options.method ?? 'GET'
    const headers = this.buildHeaders(method, options.extraHeaders)
    let body: string | FormData | undefined
    if (options.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.jsonBody)
    } else if (options.formData) {
      body = options.formData
    }
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000
    )
    try {
      return await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'manual',
      })
    } catch (err) {
      throw new ConnectionError(
        `Сервер LatexSpace недоступен: ${url.origin}`,
        err
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private async rawRequest<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    if (!options.noAuth) {
      await this.ensureSession()
    }
    const res = await this.rawFetch(path, options)
    this.captureCookies(res)

    const isAuthFailure =
      res.status === 401 ||
      (res.status >= 300 &&
        res.status < 400 &&
        /\/login/.test(res.headers.get('location') ?? ''))

    if (isAuthFailure && !options.noAuth) {
      if (!options.isRetry) {
        // сессия истекла — перелогиниться и повторить один раз
        this.resetSession()
        await this.ensureSession()
        return this.rawRequest<T>(path, { ...options, isRetry: true })
      }
      throw new AuthError(
        'Сессия недействительна: проверьте e-mail и пароль'
      )
    }

    if (res.status >= 300 && res.status < 400) {
      throw new ApiError(
        `Сервер перенаправил запрос (${res.headers.get('location') ?? '?'}) — проверьте учётные данные`,
        res.status,
        res.headers.get('location') ?? ''
      )
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(
        `HTTP ${res.status} для ${options.method ?? 'GET'} ${path}`,
        res.status,
        text.slice(0, 500)
      )
    }
    if (options.expect === 'none') {
      await res.arrayBuffer().catch(() => undefined)
      return undefined as T
    }
    if (options.expect === 'buffer') {
      const ab = await res.arrayBuffer()
      return Buffer.from(ab) as unknown as T
    }
    const text = await res.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new ApiError(
        `Ожидался JSON от ${path}, получено: ${text.slice(0, 120)}`,
        res.status,
        text.slice(0, 500)
      )
    }
  }

  private request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.rawRequest<T>(path, options)
  }

  /** Проверка подключения и учётных данных. */
  async checkAuth(): Promise<void> {
    await this.request('/user/projects')
  }

  /**
   * Cookie-заголовок текущей сессии для websocket-подключения
   * (real-time аутентифицируется той же сессионной cookie).
   */
  async getWsCookieHeader(): Promise<string> {
    await this.ensureSession()
    const cookie = this.cookieHeader()
    if (!cookie) throw new AuthError('нет сессионной cookie')
    return cookie
  }

  // ---------- SyncTeX ----------

  /** Код → PDF: позиции прямоугольников в PDF. */
  async syncCode(
    projectId: string,
    file: string,
    line: number,
    column: number,
    sync: { editorId: string; buildId: string; clsiServerId?: string }
  ): Promise<SyncPdfPosition[]> {
    const res = await this.request<{ pdf?: SyncPdfPosition[] }>(
      `/project/${projectId}/sync/code`,
      {
        query: {
          file,
          line: String(line),
          column: String(column),
          editorId: sync.editorId,
          buildId: sync.buildId,
          clsiserverid: sync.clsiServerId,
        },
      }
    )
    return res.pdf ?? []
  }

  /** PDF → код: файл/строка по координатам страницы (пункты PDF). */
  async syncPdf(
    projectId: string,
    page: number,
    h: number,
    v: number,
    sync: { editorId: string; buildId: string; clsiServerId?: string }
  ): Promise<SyncCodePosition[]> {
    const res = await this.request<{ code?: SyncCodePosition[] }>(
      `/project/${projectId}/sync/pdf`,
      {
        query: {
          page: String(page),
          // сервер требует формат с десятичной точкой
          h: h.toFixed(2),
          v: v.toFixed(2),
          editorId: sync.editorId,
          buildId: sync.buildId,
          clsiserverid: sync.clsiServerId,
        },
      }
    )
    return res.code ?? []
  }

  // ---------- Проекты ----------

  async listProjects(): Promise<ProjectListItem[]> {
    // POST /api/project даёт имена, даты и владельцев (в отличие от /user/projects)
    const res = await this.request<{ projects: ProjectListItem[] }>(
      '/api/project',
      { method: 'POST', jsonBody: {} }
    )
    return (res.projects ?? []).filter(p => !p.archived && !p.trashed)
  }

  async createProject(name: string): Promise<string> {
    const res = await this.request<{ project_id: string }>('/project/new', {
      method: 'POST',
      jsonBody: { projectName: name },
    })
    return res.project_id
  }

  async getEntities(projectId: string): Promise<ProjectEntity[]> {
    const res = await this.request<{ entities: ProjectEntity[] }>(
      `/project/${projectId}/entities`
    )
    return res.entities ?? []
  }

  async downloadZip(projectId: string): Promise<Buffer> {
    return this.request<Buffer>(`/Project/${projectId}/download/zip`, {
      expect: 'buffer',
      timeoutMs: 120_000,
    })
  }

  // ---------- Синхронизация ----------

  async uploadByPath(
    projectId: string,
    relPath: string,
    content: Buffer
  ): Promise<UploadByPathResult> {
    const name = relPath.split('/').pop() ?? relPath
    const fd = new FormData()
    fd.append('qqfile', new Blob([new Uint8Array(content)]), name)
    fd.append('name', name)
    fd.append('path', '/' + relPath)
    return this.request<UploadByPathResult>(
      `/project/${projectId}/upload-by-path`,
      { method: 'POST', formData: fd, timeoutMs: 60_000 }
    )
  }

  async syncFromZip(
    projectId: string,
    zip: Buffer
  ): Promise<SyncFromZipResult> {
    const fd = new FormData()
    fd.append('qqfile', new Blob([new Uint8Array(zip)]), 'project.zip')
    fd.append('name', 'project.zip')
    return this.request<SyncFromZipResult>(
      `/project/${projectId}/sync-from-zip`,
      { method: 'POST', formData: fd, timeoutMs: 300_000 }
    )
  }

  /**
   * Номер последней версии истории проекта.
   * Использует GET /project/:id/updates (project-history).
   */
  async getLatestVersion(projectId: string): Promise<number> {
    const res = await this.request<{ updates?: Array<{ toV?: number }> }>(
      `/project/${projectId}/updates`,
      { query: { min_count: '1' } }
    )
    return res.updates?.[0]?.toV ?? 0
  }

  // ---------- Компиляция ----------

  async compile(
    projectId: string,
    body: {
      compiler?: string
      draft?: boolean
      stopOnFirstError?: boolean
      incrementalCompilesEnabled?: boolean
      editorId?: string
    }
  ): Promise<CompileResponse> {
    return this.request<CompileResponse>(`/project/${projectId}/compile`, {
      method: 'POST',
      jsonBody: body,
      query: { file_line_errors: 'true' },
      timeoutMs: 600_000,
    })
  }

  async stopCompile(projectId: string): Promise<void> {
    await this.request(`/project/${projectId}/compile/stop`, {
      method: 'POST',
      expect: 'none',
    })
  }

  /** Скачать выходной файл компиляции по url из ответа compile. */
  async downloadOutputFile(
    outputUrl: string,
    clsiServerId?: string
  ): Promise<Buffer> {
    return this.request<Buffer>(outputUrl, {
      expect: 'buffer',
      query: clsiServerId ? { clsiserverid: clsiServerId } : {},
      timeoutMs: 120_000,
    })
  }

  // ---------- Комментарии ----------

  async getComments(projectId: string): Promise<ServerComment[]> {
    const res = await this.request<{ comments: ServerComment[] }>(
      `/api/project/${projectId}/comments`
    )
    return res.comments ?? []
  }

  async getRanges(projectId: string): Promise<DocRanges[]> {
    const res = await this.request<DocRanges[]>(`/project/${projectId}/ranges`)
    return Array.isArray(res) ? res : []
  }

  /** Треды комментариев (сообщения + resolved), без позиций. */
  async getThreads(projectId: string): Promise<
    Record<
      string,
      {
        messages: Array<{
          id: string
          content: string
          timestamp: string
          user: CommentAuthorInfo | null
        }>
        resolved?: boolean
      }
    >
  > {
    return this.request(`/project/${projectId}/threads`)
  }

  async replyToThread(
    projectId: string,
    threadId: string,
    content: string
  ): Promise<CommentMessage> {
    return this.request<CommentMessage>(
      `/project/${projectId}/thread/${threadId}/messages`,
      { method: 'POST', jsonBody: { content } }
    )
  }

  async resolveThread(
    projectId: string,
    docId: string,
    threadId: string
  ): Promise<void> {
    await this.request(
      `/project/${projectId}/doc/${docId}/thread/${threadId}/resolve`,
      { method: 'POST', expect: 'none' }
    )
  }

  /** Принять tracked changes (по идентификаторам правок). */
  async acceptChanges(
    projectId: string,
    docId: string,
    changeIds: string[]
  ): Promise<void> {
    await this.request(
      `/project/${projectId}/doc/${docId}/changes/accept`,
      { method: 'POST', jsonBody: { change_ids: changeIds }, expect: 'none' }
    )
  }

  async reopenThread(
    projectId: string,
    docId: string,
    threadId: string
  ): Promise<void> {
    await this.request(
      `/project/${projectId}/doc/${docId}/thread/${threadId}/reopen`,
      { method: 'POST', expect: 'none' }
    )
  }
}
