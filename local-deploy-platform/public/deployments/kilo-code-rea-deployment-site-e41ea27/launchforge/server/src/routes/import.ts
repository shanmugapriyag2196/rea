import { Router } from 'express'
import { ProjectService } from '../services/projects'
import { z } from 'zod'

const router = Router()
const service = new ProjectService()

const ImportSchema = z.object({
  name: z.string().optional(),
  rootDir: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  outputDir: z.string().optional(),
})

router.post('/', async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const buffer = Buffer.concat(chunks)
  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: 'No archive provided' })
  }
  const parsed = ImportSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.issues })
  try {
    const project = await service.importFromArchive(buffer, parsed.data)
    res.status(201).json({ project })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router