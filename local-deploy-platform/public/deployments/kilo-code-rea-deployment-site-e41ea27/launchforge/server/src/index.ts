import express, { NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env, paths } from './config'
import { initDb } from './db'
import projectsRouter from './routes/projects'
import deploymentsRouter from './routes/deployments'
import envvarsRouter from './routes/envvars'
import domainsRouter from './routes/domains'
import templatesRouter from './routes/templates'
import analyticsRouter from './routes/analytics'
import previewRouter from './routes/preview'
import importRouter from './routes/import'
import githubRouter from './routes/github'
import { mkdirSync, existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'

const app = express()

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: `http://${env.HOST}:${3000}`, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.raw({ type: 'application/zip', limit: env.MAX_ARCHIVE_BYTES + 'b' }))

app.use('/api/projects', projectsRouter)
app.use('/api/deployments', deploymentsRouter)
app.use('/api/env-vars', envvarsRouter)
app.use('/api/domains', domainsRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/preview', previewRouter)
app.use('/api/import', importRouter)
app.use('/api/github', githubRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV })
})

// Serve built frontend
const distDir = resolve(process.cwd(), 'client', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1d', etag: true }))
  // SPA fallback (must be after API routes and static)
  app.get('*', (req, res) => {
    const target = join(distDir, 'index.html')
    if (existsSync(target)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.sendFile(target)
    }
  })
}

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

export function startServer(): Promise<express.Express> {
  return new Promise((resolve) => {
    mkdirSync(paths.dataDir, { recursive: true })
    mkdirSync(paths.deployDir, { recursive: true })
    mkdirSync(paths.tmpDir, { recursive: true })
    initDb()
    app.listen(env.PORT, env.HOST, () => {
      console.log(`LaunchForge API running on http://${env.HOST}:${env.PORT}`)
      resolve(app)
    })
  })
}

export default app

startServer()