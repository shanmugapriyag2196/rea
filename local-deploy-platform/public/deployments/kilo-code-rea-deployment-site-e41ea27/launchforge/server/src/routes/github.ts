import { Router } from 'express'
import { ProjectService } from '../services/projects'
import { z } from 'zod'

const router = Router()
const service = new ProjectService()

const GitHubSchema = z.object({
  repo: z.string().min(1),
  name: z.string().optional(),
})

// Download a public GitHub repo as a zip and import it as a project.
router.post('/', async (req, res) => {
  const parsed = GitHubSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues })

  const { repo, name } = parsed.data
  const cleaned = repo
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  const parts = cleaned.split('/')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return res.status(400).json({ error: 'Invalid GitHub repo URL. Expected github.com/<owner>/<repo>' })
  }
  const owner = parts[0]
  const repoName = parts[1]
  const branch = parts[2] || 'HEAD'

  const archiveUrl = `https://codeload.github.com/${owner}/${repoName}/zip/${branch}`
  let fetchRes: Response
  try {
    fetchRes = await fetch(archiveUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'LaunchForge/1.0', Accept: 'application/zip' },
    })
  } catch (err: any) {
    return res.status(502).json({ error: 'Failed to reach GitHub: ' + err.message })
  }

  if (!fetchRes.ok || fetchRes.status >= 400) {
    return res.status(400).json({ error: `GitHub returned ${fetchRes.status} for ${archiveUrl}` })
  }

  const buffer = Buffer.from(await fetchRes.arrayBuffer())

  try {
    const project = await service.importFromArchive(buffer, {
      name: name || repoName,
    })
    res.status(201).json({ project })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router