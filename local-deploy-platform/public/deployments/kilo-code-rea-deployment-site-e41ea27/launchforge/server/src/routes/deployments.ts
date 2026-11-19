import { Router } from 'express'
import { getDb } from '../db'
import { BuildService } from '../services/build'
import { ProjectService } from '../services/projects'
import { z } from 'zod'

const router = Router()
const projectService = new ProjectService()
const buildService = new BuildService()

const DeploySchema = z.object({
  buildCommand: z.string().nullable().optional(),
  installCommand: z.string().nullable().optional(),
  outputDir: z.string().nullable().optional(),
  rootDir: z.string().optional(),
})

router.get('/', (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined
  const db = getDb()
  const rows = projectId
    ? db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    : db.prepare('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 100').all()
  res.json({ deployments: (rows as any[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    status: r.status,
    buildCommand: r.build_command,
    outputDir: r.output_dir,
    source: r.source,
    logs: r.logs,
    exitCode: r.exit_code,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    previewPath: r.preview_path,
  })) })
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM deployments WHERE id = ?').get(req.params.id) as any
  if (!row) return res.status(404).json({ error: 'Deployment not found' })
  res.json({ deployment: {
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
  } })
})

router.post('/:projectId/deploy', async (req, res) => {
  const project = projectService.get(req.params.projectId)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const parsed = DeploySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  try {
    const result = await buildService.build(project, parsed.data)
    res.status(201).json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router