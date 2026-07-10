import * as vscode from 'vscode'
import { LatexSpaceClient } from './api/client'
import { DEFAULT_SPLIT_ENVS } from './latex/explode'
import { ProjectMeta } from './sync/state'

const PASSWORD_SECRET_KEY = 'latexspace.userPassword'

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('latexspace')
  return {
    serverUrl: cfg.get<string>('serverUrl', 'http://localhost'),
    userEmail: cfg.get<string>('userEmail', ''),
    compileMode: cfg.get<'auto' | 'server' | 'local'>('compile.mode', 'auto'),
    compiler: cfg.get<string>('compile.compiler', 'pdflatex'),
    draft: cfg.get<boolean>('compile.draft', false),
    stopOnFirstError: cfg.get<boolean>('compile.stopOnFirstError', false),
    rootFile: cfg.get<string>('compile.rootFile', ''),
    localCommand: cfg.get<string>('compile.localCommand', 'latexmk'),
    localArgs: cfg.get<string[]>('compile.localArgs', []),
    autoPush: cfg.get<boolean>('sync.autoPush', true),
    autoPushNewFiles: cfg.get<boolean>('sync.autoPushNewFiles', false),
    compileOnSave: cfg.get<boolean>('compile.onSave', true),
    autoPull: cfg.get<boolean>('sync.autoPull', true),
    pollIntervalSeconds: Math.max(
      5,
      cfg.get<number>('sync.pollIntervalSeconds', 15)
    ),
    deepReconcileEveryNPolls: cfg.get<number>(
      'sync.deepReconcileEveryNPolls',
      10
    ),
    ignore: cfg.get<string[]>('sync.ignore', []),
    hiddenFilePatterns: cfg.get<string[]>('ui.hiddenFilePatterns', []),
    syncFineGrained: cfg.get<boolean>('synctex.fineGrained', true),
    splitEnvironments: cfg.get<string[]>(
      'synctex.splitEnvironments',
      DEFAULT_SPLIT_ENVS
    ),
  }
}

/**
 * Тихая сборка клиента: без каких-либо диалогов.
 * undefined — если e-mail или пароль ещё не заданы.
 */
export async function buildClientSilent(
  context: vscode.ExtensionContext,
  meta?: ProjectMeta
): Promise<LatexSpaceClient | undefined> {
  const cfg = getConfig()
  const email = meta?.userEmail || cfg.userEmail
  const password = await context.secrets.get(PASSWORD_SECRET_KEY)
  if (!email || !password) return undefined
  return new LatexSpaceClient({
    serverUrl: meta?.serverUrl || cfg.serverUrl,
    email,
    password,
  })
}

/** Забыть пароль (смена пользователя). */
export async function clearStoredPassword(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(PASSWORD_SECRET_KEY)
}

/**
 * Единственный способ входа: адрес сервера → e-mail → пароль
 * (та же учётная запись, что и в браузере).
 * Пароль хранится в SecretStorage VSCode.
 */
export async function setCredentialsFlow(
  context: vscode.ExtensionContext,
  presetServerUrl?: string
): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration('latexspace')

  const serverUrl = await vscode.window.showInputBox({
    title: 'LatexSpace (шаг 1/3): адрес сервера',
    prompt: 'Например, https://latex.example.org',
    value: presetServerUrl || cfg.get<string>('serverUrl', 'http://localhost'),
    ignoreFocusOut: true,
    validateInput: v =>
      /^https?:\/\//.test(v.trim()) ? undefined : 'Укажите URL с http(s)://',
  })
  if (serverUrl === undefined) return false

  const email = await vscode.window.showInputBox({
    title: 'LatexSpace (шаг 2/3): e-mail',
    prompt: 'Ваша учётная запись LatexSpace — та же, что в браузере',
    value: cfg.get<string>('userEmail', ''),
    ignoreFocusOut: true,
    validateInput: v => (v.trim().includes('@') ? undefined : 'Укажите e-mail'),
  })
  if (email === undefined) return false

  const password = await vscode.window.showInputBox({
    title: 'LatexSpace (шаг 3/3): пароль',
    prompt: 'Хранится в защищённом хранилище VSCode (Keychain)',
    password: true,
    ignoreFocusOut: true,
  })
  if (password === undefined) return false

  await cfg.update(
    'serverUrl',
    serverUrl.trim().replace(/\/+$/, ''),
    vscode.ConfigurationTarget.Global
  )
  await cfg.update('userEmail', email.trim(), vscode.ConfigurationTarget.Global)
  if (password) await context.secrets.store(PASSWORD_SECRET_KEY, password)

  // сразу проверить подключение
  const client = await buildClient(context)
  if (client) {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LatexSpace: проверка подключения…',
        },
        () => client.checkAuth()
      )
      void vscode.window.showInformationMessage('LatexSpace: вход выполнен.')
    } catch (err) {
      void vscode.window.showErrorMessage(
        `LatexSpace: войти не удалось — ${err instanceof Error ? err.message : err}`
      )
      return false
    }
  }
  return true
}

/**
 * Собрать API-клиент по настройкам (serverUrl из привязки проекта имеет
 * приоритет). При нехватке данных предлагает пройти вход.
 */
export async function buildClient(
  context: vscode.ExtensionContext,
  meta?: ProjectMeta
): Promise<LatexSpaceClient | undefined> {
  const cfg = getConfig()
  const serverUrl = meta?.serverUrl || cfg.serverUrl
  const email = meta?.userEmail || cfg.userEmail
  const password = await context.secrets.get(PASSWORD_SECRET_KEY)
  if (!email || !password) {
    const pick = await vscode.window.showWarningMessage(
      'LatexSpace: нужно войти (адрес сервера, e-mail, пароль).',
      'Войти…'
    )
    if (pick !== 'Войти…') return undefined
    const ok = await setCredentialsFlow(context)
    if (!ok) return undefined
    const savedPassword = await context.secrets.get(PASSWORD_SECRET_KEY)
    const savedCfg = getConfig()
    if (!savedPassword || !(meta?.userEmail || savedCfg.userEmail))
      return undefined
    return new LatexSpaceClient({
      serverUrl: meta?.serverUrl || savedCfg.serverUrl,
      email: meta?.userEmail || savedCfg.userEmail,
      password: savedPassword,
    })
  }
  return new LatexSpaceClient({ serverUrl, email, password })
}
