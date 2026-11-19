import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db'
import { env, paths } from '../config'
import { ArchiveService } from './archive'
import { FRAMEWORK_DEFAULTS, Framework, Project } from '../types'
import { isSafeRelativePath, safeJoin } from '../security'

export interface CreateProjectOptions {
  name: string
  framework?: Framework
  buildCommand?: string
  installCommand?: string
  outputDir?: string
  rootDir?: string
  repoPath?: string
  template?: string
}

export class ProjectService {
  private archive = new ArchiveService()

async create(options: CreateProjectOptions): Promise<Project> {
    const db = getDb()
    const id = randomUUID()
    const slug = this.slugify(options.name)
    const framework = options.framework || 'unknown'
    const defaults = FRAMEWORK_DEFAULTS[framework]

    const project: Project = {
      id,
      name: options.name,
      slug,
      framework,
      buildCommand: options.buildCommand ?? defaults.buildCommand,
      installCommand: options.installCommand ?? defaults.installCommand,
      outputDir: options.outputDir ?? defaults.outputDir,
      rootDir: options.rootDir ?? '.',
      repoPath: options.repoPath ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {},
    }

    if (options.template) {
      try {
        await this.applyTemplate(project, options.template)
      } catch {
        // Unknown or unsupported template — create as a basic project
      }
    }

    db.prepare(`
      INSERT INTO projects (id, name, slug, framework, build_command, install_command, output_dir, root_dir, repo_path, created_at, updated_at, settings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id,
      project.name,
      project.slug,
      project.framework,
      project.buildCommand,
      project.installCommand,
      project.outputDir,
      project.rootDir,
      project.repoPath,
      project.createdAt,
      project.updatedAt,
      JSON.stringify(project.settings)
    )

    const result = {
      id: project.id,
      name: project.name,
      slug: project.slug,
      framework: project.framework,
      buildCommand: project.buildCommand,
      installCommand: project.installCommand,
      outputDir: project.outputDir,
      rootDir: project.rootDir,
      repoPath: project.repoPath,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      settings: project.settings,
    }
    return result
  }

  async importFromArchive(buffer: Buffer, options: { name?: string; rootDir?: string; buildCommand?: string; installCommand?: string; outputDir?: string }): Promise<Project> {
    const extracted = await this.archive.importArchive(buffer, {
      name: options.name,
      rootDir: options.rootDir,
    })

    return this.create({
      name: extracted.name,
      framework: options.buildCommand ? 'unknown' : extracted.detectedFramework,
      buildCommand: options.buildCommand,
      installCommand: options.installCommand,
      outputDir: options.outputDir,
      rootDir: extracted.rootDir,
      repoPath: extracted.repoPath,
    })
  }

  list(search?: string): Project[] {
    const db = getDb()
    let rows
    if (search) {
      rows = db.prepare('SELECT * FROM projects WHERE name LIKE ? ORDER BY created_at DESC').all('%' + search + '%')
    } else {
      rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
    }
    return (rows as any[]).map((r) => this.toCamel(r))
  }

  get(id: string): Project | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return row ? this.toCamel(row as any) : null
  }

  getBySlug(slug: string): Project | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug)
    return row ? this.toCamel(row as any) : null
  }

  update(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | null {
    const db = getDb()
    const existing = this.get(id)
    if (!existing) return null

    const snakeMap: Record<string, string> = {
      buildCommand: 'build_command',
      installCommand: 'install_command',
      outputDir: 'output_dir',
      rootDir: 'root_dir',
      repoPath: 'repo_path',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
    const fields: string[] = []
    const values: any[] = []
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue
      const col = snakeMap[key] || key
      fields.push(col + ' = ?')
      values.push(typeof value === 'object' ? JSON.stringify(value) : value)
    }
    if (fields.length === 0) return existing
    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)

    db.prepare('UPDATE projects SET ' + fields.join(', ') + ' WHERE id = ?').run(...values)
    return this.get(id)
  }

  delete(id: string): boolean {
    const db = getDb()
    const project = this.get(id)
    if (!project) return false
    if (project.repoPath && existsSync(project.repoPath)) {
      rmSync(project.repoPath, { recursive: true, force: true })
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  }

  private toCamel(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      framework: row.framework,
      buildCommand: row.build_command,
      installCommand: row.install_command,
      outputDir: row.output_dir,
      rootDir: row.root_dir,
      repoPath: row.repo_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings ? JSON.parse(row.settings) : {},
    }
  }

  private async applyTemplate(project: Project, templateKey: string): Promise<void> {
    const { TemplateService } = await import('./templates')
    const templates = new TemplateService()
    const template = templates.get(templateKey)
    if (!template) throw new Error('Template not found: ' + templateKey)
    const targetDir = join(paths.root, 'repos', project.id)
    mkdirSync(targetDir, { recursive: true })
    await template.apply(targetDir)
    project.repoPath = targetDir
    project.framework = template.framework
    project.buildCommand = template.build_command
    project.installCommand = template.install_command
    project.outputDir = template.output_dir
    project.rootDir = '.'
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return base + '-' + randomUUID().slice(0, 8)
  }
}