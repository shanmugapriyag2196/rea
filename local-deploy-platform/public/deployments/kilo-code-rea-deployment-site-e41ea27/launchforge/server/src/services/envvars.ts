import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { EnvVar } from '../types'

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/i

export class EnvVarService {
  list(projectId: string): EnvVar[] {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM env_vars WHERE project_id = ? ORDER BY key').all(projectId) as any[]
    return rows.map((r) => this.toCamel(r))
  }

  get(projectId: string, key: string): EnvVar | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM env_vars WHERE project_id = ? AND key = ?').get(projectId, key)
    return row ? this.toCamel(row as any) : null
  }

  create(projectId: string, input: { key: string; value: string; isSecret?: boolean; scope?: 'development' | 'build' | 'runtime' }): EnvVar {
    if (!KEY_RE.test(input.key)) {
      throw new Error('Invalid environment variable name: ' + input.key + '. Must match [A-Z0-9_]')
    }
    const db = getDb()
    const id = randomUUID()
    const now = Date.now()
    const record: EnvVar = {
      id,
      projectId,
      key: input.key,
      value: input.value,
      isSecret: input.isSecret ?? false,
      scope: input.scope || 'build',
      createdAt: now,
      updatedAt: now,
    }
    db.prepare(`
      INSERT INTO env_vars (id, project_id, key, value, is_secret, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, input.key, input.value, record.isSecret ? 1 : 0, record.scope, now, now)
    return record
  }

  update(projectId: string, key: string, input: Partial<{ value: string; isSecret: boolean; scope: 'development' | 'build' | 'runtime' }>): EnvVar | null {
    const db = getDb()
    const existing = this.get(projectId, key)
    if (!existing) return null
    const fields: string[] = []
    const values: any[] = []
    if (input.value !== undefined) { fields.push('value = ?'); values.push(input.value) }
    if (input.isSecret !== undefined) { fields.push('is_secret = ?'); values.push(input.isSecret ? 1 : 0) }
    if (input.scope !== undefined) { fields.push('scope = ?'); values.push(input.scope) }
    if (fields.length === 0) return existing
    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(projectId)
    values.push(key)
    db.prepare('UPDATE env_vars SET ' + fields.join(', ') + ' WHERE project_id = ? AND key = ?').run(...values)
    return this.get(projectId, key)
  }

  delete(projectId: string, key: string): boolean {
    const db = getDb()
    const result = db.prepare('DELETE FROM env_vars WHERE project_id = ? AND key = ?').run(projectId, key)
    return result.changes > 0
  }

  maskedList(projectId: string): Array<Omit<EnvVar, 'value'> & { masked_value: string }> {
    return this.list(projectId).map((v) => ({
      ...v,
      masked_value: v.isSecret ? '••••••••' : v.value,
    }))
  }

  private toCamel(row: any): EnvVar {
    return {
      id: row.id,
      projectId: row.project_id,
      key: row.key,
      value: row.value,
      isSecret: Boolean(row.is_secret),
      scope: row.scope,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}