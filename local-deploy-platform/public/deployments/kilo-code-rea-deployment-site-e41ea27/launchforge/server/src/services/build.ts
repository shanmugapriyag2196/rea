import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { getDb } from '../db'
import { env, paths } from '../config'
import { Project, Deployment, EnvVar } from '../types'
import { safeJoin } from '../security'
import { EnvVarService } from './envvars'

export interface BuildOptions {
  buildCommand?: string | null
  installCommand?: string | null
  outputDir?: string | null
  rootDir?: string
  envVars?: EnvVar[]
  timeoutMs?: number
}

export interface BuildResult {
  deploymentId: string
  status: 'ready' | 'failed'
  logs: string
  exitCode: number | null
  durationMs: number
  previewPath?: string
}

export class BuildService {
  private envVarService = new EnvVarService()

  async build(project: Project, options: BuildOptions = {}): Promise<BuildResult> {
    const db = getDb()
    const deploymentId = randomUUID()
    const startedAt = Date.now()
    const logs: string[] = []
    const repoPath = project.repoPath || join(paths.root, 'repos', project.id)
    const outputDir = options.outputDir || project.outputDir || 'public'
    const rootDir = options.rootDir || project.rootDir || '.'
    const buildCommand = options.buildCommand ?? project.buildCommand
    const installCommand = options.installCommand ?? project.installCommand

    if (!existsSync(repoPath)) {
      throw new Error('Project source not found: ' + repoPath)
    }

    const buildDir = isAbsolute(repoPath) ? join(repoPath, rootDir) : safeJoin(repoPath, rootDir)
    if (!existsSync(buildDir)) {
      throw new Error('Project root directory not found: ' + buildDir)
    }

    const deploymentDir = join(paths.deployDir, deploymentId)
    mkdirSync(deploymentDir, { recursive: true })

    const envVars = options.envVars || this.envVarService.list(project.id)
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const v of envVars) {
      if (v.scope === 'build' || v.scope === 'runtime') {
        env[v.key] = v.value
      }
    }

    let exitCode: number | null = null
    let failed = false

    if (installCommand) {
      logs.push('> ' + installCommand)
      const installResult = await this.runCommand(installCommand, buildDir, env, (options.timeoutMs ?? env.BUILD_TIMEOUT_MS) as number, logs)
      exitCode = installResult.exitCode
      if (exitCode !== 0) {
        failed = true
      }
    }

    if (!failed && buildCommand) {
      logs.push('> ' + buildCommand)
      const buildResult = await this.runCommand(buildCommand, buildDir, env, (options.timeoutMs ?? env.BUILD_TIMEOUT_MS) as number, logs)
      exitCode = buildResult.exitCode
      if (exitCode !== 0) {
        failed = true
      }
    }

    const durationMs = Date.now() - startedAt
    const logsText = logs.join('\n')

    if (!failed) {
      const outputPath = isAbsolute(buildDir) ? join(buildDir, outputDir) : safeJoin(buildDir, outputDir)
      if (!existsSync(outputPath)) {
        throw new Error('Build output directory not found: ' + outputPath + '. Expected: ' + outputDir)
      }
      await this.copyDir(outputPath, deploymentDir)
    } else {
      rmSync(deploymentDir, { recursive: true, force: true })
    }

    const status = failed ? 'failed' : 'ready'
    db.prepare(`
      INSERT INTO deployments (id, project_id, status, build_command, output_dir, source, logs, exit_code, duration_ms, created_at, updated_at, preview_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deploymentId,
      project.id,
      status,
      buildCommand,
      outputDir,
      'local',
      logsText,
      exitCode,
      durationMs,
      startedAt,
      Date.now(),
      failed ? null : deploymentDir
    )

    return {
      deploymentId,
      status,
      logs: logsText,
      exitCode,
      durationMs,
      previewPath: failed ? undefined : deploymentDir,
    }
  }

  list(projectId: string): Deployment[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[]
    return rows.map((r) => this.toCamel(r))
  }

  get(id: string): Deployment | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(id)
    return row ? this.toCamel(row as any) : null
  }

  private toCamel(row: any): Deployment {
    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      buildCommand: row.build_command,
      outputDir: row.output_dir,
      source: row.source,
      logs: row.logs,
      exitCode: row.exit_code,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      previewPath: row.preview_path,
    }
  }

  private async runCommand(command: string, cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, logs: string[]): Promise<{ exitCode: number }> {
    return new Promise((resolve, reject) => {
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }, timeoutMs)

      const proc = spawn(command, {
        cwd,
        env,
        shell: true,
        stdio: 'pipe',
      })

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        logs.push(text.trimEnd())
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        logs.push(text.trimEnd())
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        if (timedOut) {
          logs.push('Build timed out after ' + timeoutMs + 'ms')
          resolve({ exitCode: 124 })
        } else {
          resolve({ exitCode: code ?? 1 })
        }
      })
    })
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    const fs = await import('node:fs/promises')
    await fs.mkdir(dest, { recursive: true })
    const entries = await fs.readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      const s = join(src, entry.name)
      const d = join(dest, entry.name)
      if (entry.isDirectory()) {
        await this.copyDir(s, d)
      } else {
        await fs.copyFile(s, d)
      }
    }
  }
}