import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve, normalize, basename } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import { paths, env } from '../config'
import { isSafeRelativePath, safeJoin } from '../security'
import { FRAMEWORK_DEFAULTS, Framework } from '../types'

export interface ExtractedProject {
  rootDir: string
  files: string[]
  detectedFramework: Framework
}

export interface ImportOptions {
  name?: string
  rootDir?: string
  buildCommand?: string
  installCommand?: string
  outputDir?: string
}

export class ArchiveService {
  async importArchive(buffer: Buffer, options: ImportOptions = {}): Promise<ExtractedProject & { id: string; name: string; repoPath: string }> {
    if (buffer.length > env.MAX_ARCHIVE_BYTES) {
      throw new Error(`Archive too large: ${buffer.length} bytes exceeds limit of ${env.MAX_ARCHIVE_BYTES}`)
    }

    const tmpRoot = mkdtempSync(join(tmpdir(), 'launchforge-import-'))
    try {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()

      if (entries.length === 0) throw new Error('Archive is empty')
      if (entries.length > env.MAX_FILE_COUNT) throw new Error(`Archive has too many files: ${entries.length}`)

      let totalExtracted = 0
      const writtenFiles: string[] = []

      for (const entry of entries) {
        if (entry.isDirectory) continue
        const entryName = entry.entryName
        if (!isSafeRelativePath(entryName)) {
          throw new Error(`Unsafe path in archive: ${entryName}`)
        }
        const content = (entry as any).getContent()
        totalExtracted += content.length
        if (totalExtracted > env.MAX_EXTRACTED_BYTES) {
          throw new Error(`Extracted size exceeds limit of ${env.MAX_EXTRACTED_BYTES} bytes`)
        }
        const target = safeJoin(tmpRoot, entryName)
        mkdirSync(resolve(target, '..'), { recursive: true })
        await writeFile(target, content)
        writtenFiles.push(entryName)
      }

      const rootDir = options.rootDir || this.detectRootDir(tmpRoot, writtenFiles)
      const framework = options.buildCommand ? 'unknown' : this.detectFramework(tmpRoot, rootDir)

      const repoPath = join(paths.root, 'repos', randomUUID())
      mkdirSync(repoPath, { recursive: true })
      await this.copyFiles(join(tmpRoot, rootDir), repoPath)

      const name = options.name || basename(rootDir) || 'untitled-project'

      return {
        id: randomUUID(),
        name,
        rootDir,
        files: writtenFiles,
        detectedFramework: framework,
        repoPath,
      }
    } catch (err) {
      rmSync(tmpRoot, { recursive: true, force: true })
      throw err
    }
  }

  private detectRootDir(root: string, files: string[]): string {
    const dirs = new Set<string>()
    for (const f of files) {
      const parts = f.split('/')
      if (parts.length > 1) dirs.add(parts[0])
    }
    if (dirs.size === 1) return Array.from(dirs)[0]
    return '.'
  }

  private detectFramework(root: string, rootDir: string): Framework {
    const pkgPath = join(root, rootDir, 'package.json')
    if (!existsSync(pkgPath)) {
      if (rootDir === '.' && existsSync(join(root, 'index.html'))) return 'static'
      return 'unknown'
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const scripts = pkg.scripts || {}

      if (deps.vite || existsSync(join(root, rootDir, 'vite.config.ts')) || existsSync(join(root, rootDir, 'vite.config.js'))) {
        return 'vite'
      }
      if (deps.next || existsSync(join(root, rootDir, 'next.config.js'))) {
        return 'next'
      }
      if (deps.svelte || existsSync(join(root, rootDir, 'svelte.config.js'))) {
        return 'svelte'
      }
      if (deps.astro || existsSync(join(root, rootDir, 'astro.config.mjs'))) {
        return 'astro'
      }
      if (deps.preact) return 'preact'
      if (scripts.build) return 'node'
      if (existsSync(join(root, rootDir, 'index.html'))) return 'static'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private async copyFiles(src: string, dest: string): Promise<void> {
    await this.copyRecursive(src, dest)
  }

  private async copyRecursive(src: string, dest: string): Promise<void> {
    const fs = await import('node:fs/promises')
    await fs.mkdir(dest, { recursive: true })
    const entries = await fs.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const s = join(src, entry.name)
      const d = join(dest, entry.name)
      if (entry.isDirectory()) {
        await this.copyRecursive(s, d)
      } else {
        await fs.copyFile(s, d)
      }
    }
  }

  async validateArchive(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    if (!buffer || buffer.length === 0) return { valid: false, error: 'Empty archive' }
    if (buffer.length > env.MAX_ARCHIVE_BYTES) return { valid: false, error: 'Archive too large' }
    try {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
      if (entries.length === 0) return { valid: false, error: 'Archive is empty' }
      for (const e of entries) {
        if (e.isDirectory) continue
        if (!isSafeRelativePath(e.entryName)) return { valid: false, error: `Unsafe path: ${e.entryName}` }
      }
      return { valid: true }
    } catch (err: any) {
      return { valid: false, error: err.message }
    }
  }
}