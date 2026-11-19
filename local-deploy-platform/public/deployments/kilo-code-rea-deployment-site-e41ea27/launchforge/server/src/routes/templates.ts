import { Router } from 'express'
import { TemplateService } from '../services/templates'

const router = Router()
const service = new TemplateService()

router.get('/', (req, res) => {
  res.json({ templates: service.list() })
})

export default router