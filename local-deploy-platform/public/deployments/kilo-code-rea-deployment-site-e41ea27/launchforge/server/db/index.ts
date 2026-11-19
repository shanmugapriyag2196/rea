import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { paths, env } from '../config.js'

let db: Database.Database | null = null

export const initDb = (): Database.Database => {
  if (db) return db
  mkdirSync(paths.dataDir, { recursive: true })
  db = new Database(paths.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export const getDb = (): Database.Database => {
  if (!db) return initDb()
  return db
}

const migrate = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      framework TEXT,
      build_command TEXT,
      install_command TEXT,
      output_dir TEXT,
      root_dir TEXT,
      repo_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      build_command TEXT,
      output_dir TEXT,
      source TEXT,
      logs TEXT NOT NULL DEFAULT '',
      exit_code INTEGER,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      preview_path TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS env_vars (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'build',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_env_vars_project ON env_vars(project_id);
    CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);
  `)
}