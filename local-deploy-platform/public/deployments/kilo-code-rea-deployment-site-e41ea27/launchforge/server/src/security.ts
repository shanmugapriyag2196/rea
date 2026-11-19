import { resolve, normalize, isAbsolute } from 'node:path'

export const SAFE_PATH_RE = /^[a-zA-Z0-9_\-./ ]+$/

export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string') return false
  if (p === '') return false
  if (p.includes('\0')) return false
  const normalized = normalize(p)
  if (normalized.startsWith('..') || normalized.split('/').some((seg) => seg === '..')) {
    return false
  }
  if (isAbsolute(normalized)) return false
  return true
}

export function assertSafeRelativePath(p: string): void {
  if (!isSafeRelativePath(p)) {
    throw new Error('Unsafe path detected: ' + p)
  }
}

export function safeJoin(base: string, ...segments: string[]): string {
  const target = resolve(base, ...segments)
  const baseResolved = resolve(base)
  if (!target.startsWith(baseResolved + '/') && target !== baseResolved) {
    throw new Error('Path traversal detected')
  }
  return target
}

export function isSafeUnder(base: string, target: string): boolean {
  const baseResolved = resolve(base)
  const targetResolved = resolve(target)
  return targetResolved === baseResolved || targetResolved.startsWith(baseResolved + '/')
}