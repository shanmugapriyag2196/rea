import { Router } from 'express'
import { ProjectService } from '../services/projects'
import { z } from 'zod'

const router = Router()
const service = new ProjectService()

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  framework: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  outputDir: z.string().optional(),
  rootDir: z.string().optional(),
  repoPath: z.string().optional(),
  repo_path: z.string().optional(),
  template: z.string().optional(),
})

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  framework: z.string().optional(),
  buildCommand: z.string().nullable().optional(),
  installCommand: z.string().nullable().optional(),
  outputDir: z.string().nullable().optional(),
  rootDir: z.string().nullable().optional(),
  settings: z.record(z.any()).optional(),
})

router.get('/', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  res.json({ projects: service.list(search) })
})

router.get('/:id', (req, res) => {
  const project = service.get(req.params.id)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json({ project })
})

router.post('/', async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  const data = parsed.data as any
  const options = {
    name: data.name,
    framework: data.framework,
    buildCommand: data.buildCommand,
    installCommand: data.installCommand,
    outputDir: data.outputDir,
    rootDir: data.rootDir,
    repoPath: data.repoPath || data.repo_path,
    template: data.template,
  }
  try {
    const project = await service.create(options)
    res.status(201).json({ project })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/:id', (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  const project = service.update(req.params.id, parsed.data)
  if (!project) return res.status(404).json({ error: 'Project not found' })
  res.json({ project })
})

router.delete('/:id', (req, res) => {
  const ok = service.delete(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Project not found' })
  res.json({ ok: true })
})

export default router