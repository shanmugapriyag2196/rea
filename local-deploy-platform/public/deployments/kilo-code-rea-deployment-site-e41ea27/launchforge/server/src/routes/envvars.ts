import { Router } from 'express'
import { EnvVarService } from '../services/envvars'
import { z } from 'zod'

const router = Router()
const service = new EnvVarService()

const CreateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  is_secret: z.boolean().optional(),
  scope: z.enum(['development', 'build', 'runtime']).optional(),
})

const UpdateSchema = z.object({
  value: z.string().optional(),
  is_secret: z.boolean().optional(),
  scope: z.enum(['development', 'build', 'runtime']).optional(),
})

router.get('/:projectId', (req, res) => {
  res.json({ env_vars: service.maskedList(req.params.projectId) })
})

router.post('/:projectId', (req, res) => {
  const parsed = CreateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  try {
    const record = service.create(req.params.projectId, { key: parsed.data.key, value: parsed.data.value, isSecret: parsed.data.is_secret, scope: parsed.data.scope })
    res.status(201).json({ env_var: { ...record, masked_value: record.isSecret ? '••••••••' : record.value } })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.patch('/:projectId/:key', (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })
  const record = service.update(req.params.projectId, req.params.key, { value: parsed.data.value, isSecret: parsed.data.is_secret, scope: parsed.data.scope })
  if (!record) return res.status(404).json({ error: 'Environment variable not found' })
  res.json({ env_var: { ...record, masked_value: record.isSecret ? '••••••••' : record.value } })
})

router.delete('/:projectId/:key', (req, res) => {
  const ok = service.delete(req.params.projectId, req.params.key)
  if (!ok) return res.status(404).json({ error: 'Environment variable not found' })
  res.json({ ok: true })
})

export default router