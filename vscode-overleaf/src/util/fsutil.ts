import * as fs from 'fs/promises'
import * as path from 'path'
import { IgnoreMatcher } from './glob'

/** Максимальный размер файла для синхронизации (защита от случайного мусора). */
export const MAX_SYNC_FILE_SIZE = 50 * 1024 * 1024

/**
 * Рекурсивный обход каталога. Возвращает относительные пути (через "/").
 * Символические ссылки пропускаются.
 */
export async function walkDir(
  root: string,
  ignore: IgnoreMatcher,
  base = ''
): Promise<string[]> {
  const result: string[] = []
  let entries
  try {
    entries = await fs.readdir(path.join(root, base), { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (ignore.ignoresDir(rel)) continue
      result.push(...(await walkDir(root, ignore, rel)))
    } else if (entry.isFile()) {
      if (ignore.ignoresFile(rel)) continue
      result.push(rel)
    }
  }
  return result
}

export async function readFileOrNull(p: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(p)
  } catch {
    return null
  }
}

export async function writeFileEnsuringDir(
  p: string,
  content: Buffer
): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, content)
}

export async function removeFileAndEmptyDirs(
  p: string,
  stopAt: string
): Promise<void> {
  try {
    await fs.unlink(p)
  } catch {
    return
  }
  // подчистить опустевшие каталоги до корня
  let dir = path.dirname(p)
  const stop = path.resolve(stopAt)
  while (path.resolve(dir) !== stop) {
    try {
      const items = await fs.readdir(dir)
      if (items.length > 0) break
      await fs.rmdir(dir)
    } catch {
      break
    }
    dir = path.dirname(dir)
  }
}

/** Эвристика "текстовый ли файл": нет NUL-байта в первых 8 КБ. */
export function looksLikeText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return false
  }
  return true
}

/** Равенство содержимого с поправкой на CRLF/LF для текстовых файлов. */
export function contentsEqual(a: Buffer | null, b: Buffer | null): boolean {
  if (a === null || b === null) return a === b
  if (a.equals(b)) return true
  if (looksLikeText(a) && looksLikeText(b)) {
    const na = a.toString('utf8').replace(/\r\n/g, '\n')
    const nb = b.toString('utf8').replace(/\r\n/g, '\n')
    return na === nb
  }
  return false
}

/** Безопасный относительный путь из zip-архива (защита от traversal). */
export function sanitizeZipEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return null
  const parts = normalized.split('/')
  if (parts.some(p => p === '..' || p === '' || p === '.')) return null
  return parts.join('/')
}
