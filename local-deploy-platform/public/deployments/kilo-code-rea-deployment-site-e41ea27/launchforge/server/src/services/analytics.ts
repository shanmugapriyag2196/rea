import { getDb } from '../db'

export interface Analytics {
  total_projects: number
  total_deployments: number
  successful_deployments: number
  failed_deployments: number
  queued_deployments: number
  building_deployments: number
  success_rate: number | null
  avg_build_duration_ms: number | null
  recent_deployments: Array<{ id: string; project_id: string; status: string; created_at: number; duration_ms: number | null }>
}

export class AnalyticsService {
  get(): Analytics {
    const db = getDb()
    const total_projects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c
    const total_deployments = (db.prepare('SELECT COUNT(*) as c FROM deployments').get() as any).c
    const successful = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status = 'ready'").get() as any).c
    const failed = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status = 'failed'").get() as any).c
    const queued = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status = 'queued'").get() as any).c
    const building = (db.prepare("SELECT COUNT(*) as c FROM deployments WHERE status = 'building'").get() as any).c

    const success_rate = total_deployments > 0 ? Math.round((successful / total_deployments) * 100) : null
    const avg = db.prepare('SELECT AVG(duration_ms) as a FROM deployments WHERE duration_ms IS NOT NULL').get() as any
    const avg_build_duration_ms = avg.a ? Math.round(avg.a) : null

    const recent = db.prepare('SELECT id, project_id, status, created_at, duration_ms FROM deployments ORDER BY created_at DESC LIMIT 10').all() as any[]

    return {
      total_projects,
      total_deployments,
      successful_deployments: successful,
      failed_deployments: failed,
      queued_deployments: queued,
      building_deployments: building,
      success_rate,
      avg_build_duration_ms,
      recent_deployments: recent,
    }
  }
}