import { Router } from 'express'
import { AnalyticsService } from '../services/analytics'

const router = Router()
const service = new AnalyticsService()

router.get('/', (req, res) => {
  res.json(service.get())
})

export default router