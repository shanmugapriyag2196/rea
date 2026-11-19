import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { Settings } from '../types'

export class SettingsService {
  get(key: string): string | null {
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row ? row.value : null
  }

  set(key: string, value: string): void {
    const db = getDb()
    const now = Date.now()
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, now)
  }

  all(): Settings {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const result: Settings = {}
    for (const r of rows) result[r.key] = r.value
    return result
  }
}