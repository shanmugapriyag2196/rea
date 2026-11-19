import { Router } from 'express'
import { existsSync, createReadStream } from 'node:fs'
import { join, normalize } from 'node:path'
import { getDb } from '../db'
import { PreviewService } from '../services/preview'

const router = Router()
const preview = new PreviewService()

function servePreview(req: any, res: any): void {
  const db = getDb()
  const row = db.prepare('SELECT preview_path FROM deployments WHERE id = ?').get(req.params.deploymentId) as { preview_path: string } | undefined
  if (!row || !row.preview_path) {
    return res.status(404).json({ error: 'Deployment not found or not ready' })
  }
  const wildcardPath = (req.params as any)['path*'] as string
  const pathname = wildcardPath ? '/' + wildcardPath : '/'
  const resolved = preview.resolve(row.preview_path, pathname)
  if (resolved.status) {
    return res.status(resolved.status).send('Forbidden')
  }
  if (!existsSync(resolved.filePath)) {
    return res.status(404).send('Not found')
  }
  res.setHeader('Content-Type', resolved.mime)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  createReadStream(resolved.filePath).pipe(res)
}

router.get('/:deploymentId', servePreview)
router.get('/:deploymentId/:path*', servePreview)

export default router