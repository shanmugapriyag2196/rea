import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { Domain } from '../types'

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

export class DomainService {
  list(projectId: string): Domain[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM domains WHERE project_id = ? ORDER BY created_at').all(projectId) as any[]
    return rows.map((r) => this.toCamel(r))
  }

  create(projectId: string, input: { name: string; isPrimary?: boolean }): Domain {
    if (!DOMAIN_RE.test(input.name)) {
      throw new Error('Invalid domain: ' + input.name)
    }
    const db = getDb()
    const id = randomUUID()
    const now = Date.now()
    db.prepare(`
      INSERT INTO domains (id, project_id, name, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, input.name, input.isPrimary ? 1 : 0, now, now)
    return { id, projectId, name: input.name, isPrimary: input.isPrimary ?? false, createdAt: now, updatedAt: now }
  }

  delete(projectId: string, name: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM domains WHERE project_id = ? AND name = ?').run(projectId, name)
    return result.changes > 0
  }

  private toCamel(row: any): Domain {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      isPrimary: Boolean(row.is_primary),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}