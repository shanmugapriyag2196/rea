import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { paths } from '../config'

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

export const mapProject = (row: any): any => {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    framework: row.framework,
    build_command: row.build_command,
    install_command: row.install_command,
    output_dir: row.output_dir,
    root_dir: row.root_dir,
    repo_path: row.repo_path,
    created_at: row.created_at,
    updated_at: row.updated_at,
    settings: row.settings ? JSON.parse(row.settings) : {},
  }
}

export const mapDeployment = (row: any): any => {
  if (!row) return null
  return {
    id: row.id,
    project_id: row.project_id,
    status: row.status,
    build_command: row.build_command,
    output_dir: row.output_dir,
    source: row.source,
    logs: row.logs,
    exit_code: row.exit_code,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
    updated_at: row.updated_at,
    preview_path: row.preview_path,
  }
}

export const mapEnvVar = (row: any): any => {
  if (!row) return null
  return {
    id: row.id,
    project_id: row.project_id,
    key: row.key,
    value: row.value,
    is_secret: Boolean(row.is_secret),
    scope: row.scope,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const mapDomain = (row: any): any => {
  if (!row) return null
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    is_primary: Boolean(row.is_primary),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}