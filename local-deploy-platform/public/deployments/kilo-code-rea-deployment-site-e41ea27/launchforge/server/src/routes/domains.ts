import { Router } from 'express'
import { DomainService } from '../services/domains'
import { z } from 'zod'

const router = Router()
const service = new DomainService()

const CreateSchema = z.object({
  name: z.string().min(1),
  is_primary: z.boolean().optional(),
})

router.get('/:projectId', (req, res) => {
  res.json({ domains: service.list(req.params.projectId) })
})

router.post('/:projectId', (req, res) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  try {
    const domain = service.create(req.params.projectId, { name: parsed.data.name, isPrimary: parsed.data.is_primary })
    res.status(201).json({ domain })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:projectId/:name', (req, res) => {
  const ok = service.delete(req.params.projectId, req.params.name)
  if (!ok) return res.status(404).json({ error: 'Domain not found' })
  res.json({ ok: true })
})

export default router