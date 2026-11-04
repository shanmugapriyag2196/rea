"use strict";

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "data", "platform.db");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDir(path.dirname(DB_PATH));

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      framework TEXT DEFAULT 'static',
      build_command TEXT,
      output_directory TEXT,
      root_directory TEXT DEFAULT '.',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      url_path TEXT,
      artifact_path TEXT,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      build_started_at INTEGER,
      build_completed_at INTEGER,
      build_duration_ms INTEGER,
      log_path TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS environment_variables (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'config',
      environment TEXT NOT NULL DEFAULT 'production',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, key, environment)
    );

    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'production',
      verified INTEGER NOT NULL DEFAULT 0,
      ssl_status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_env_vars_project ON environment_variables(project_id);
    CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);
  `);
}

initSchema();

function now() {
  return Date.now();
}

function generateId() {
  return require("crypto").randomBytes(16).toString("hex");
}

// Project operations
function createProject(name, description = "", framework = "static") {
  const id = generateId();
  const ts = now();
  const stmt = db.prepare(
    "INSERT INTO projects (id, name, description, framework, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(id, name, description, framework, ts, ts);
  return getProjectById(id);
}

function getProjectById(id) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
}

function getProjectByName(name) {
  return db.prepare("SELECT * FROM projects WHERE name = ?").get(name);
}

function listProjects() {
  return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
}

function updateProject(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);
  const stmt = db.prepare(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`
  );
  stmt.run(...values);
  return getProjectById(id);
}

function deleteProject(id) {
  const stmt = db.prepare("DELETE FROM projects WHERE id = ?");
  return stmt.run(id);
}

// Deployment operations
function createDeployment(projectId, version, status = "pending") {
  const id = generateId();
  const ts = now();
  const stmt = db.prepare(
    "INSERT INTO deployments (id, project_id, version, status, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(id, projectId, version, status, ts);
  return getDeploymentById(id);
}

function getDeploymentById(id) {
  return db.prepare("SELECT * FROM deployments WHERE id = ?").get(id);
}

function listDeployments(projectId) {
  return db
    .prepare("SELECT * FROM deployments WHERE project_id = ? ORDER BY version DESC")
    .all(projectId);
}

function updateDeployment(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  values.push(id);
  const stmt = db.prepare(
    `UPDATE deployments SET ${fields.join(", ")} WHERE id = ?`
  );
  stmt.run(...values);
  return getDeploymentById(id);
}

function getNextVersion(projectId) {
  const row = db
    .prepare("SELECT MAX(version) as maxVersion FROM deployments WHERE project_id = ?")
    .get(projectId);
  return (row.maxVersion || 0) + 1;
}

// Environment variable operations
function setEnvVar(projectId, key, value, type = "config", environment = "production") {
  const id = generateId();
  const ts = now();
  const existing = db
    .prepare(
      "SELECT id FROM environment_variables WHERE project_id = ? AND key = ? AND environment = ?"
    )
    .get(projectId, key, environment);

  if (existing) {
    db.prepare(
      "UPDATE environment_variables SET value = ?, type = ?, updated_at = ? WHERE id = ?"
    ).run(value, type, ts, existing.id);
    return getEnvVarById(existing.id);
  }

  db.prepare(
    "INSERT INTO environment_variables (id, project_id, key, value, type, environment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, projectId, key, value, type, environment, ts, ts);
  return getEnvVarById(id);
}

function getEnvVarById(id) {
  return db.prepare("SELECT * FROM environment_variables WHERE id = ?").get(id);
}

function listEnvVars(projectId, environment) {
  if (environment) {
    return db
      .prepare(
        "SELECT id, key, type, environment, created_at, updated_at FROM environment_variables WHERE project_id = ? AND environment = ? ORDER BY key"
      )
      .all(projectId, environment);
  }
  return db
    .prepare(
      "SELECT id, key, type, environment, created_at, updated_at FROM environment_variables WHERE project_id = ? ORDER BY key"
    )
    .all(projectId);
}

function deleteEnvVar(id) {
  return db.prepare("DELETE FROM environment_variables WHERE id = ?").run(id);
}

// Domain operations
function addDomain(projectId, name, environment = "production") {
  const id = generateId();
  const ts = now();
  const stmt = db.prepare(
    "INSERT INTO domains (id, project_id, name, environment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(id, projectId, name, environment, ts, ts);
  return getDomainById(id);
}

function getDomainById(id) {
  return db.prepare("SELECT * FROM domains WHERE id = ?").get(id);
}

function listDomains(projectId) {
  return db
    .prepare("SELECT * FROM domains WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId);
}

function verifyDomain(id) {
  const ts = now();
  db.prepare(
    "UPDATE domains SET verified = 1, ssl_status = 'active', updated_at = ? WHERE id = ?"
  ).run(ts, id);
  return getDomainById(id);
}

function deleteDomain(id) {
  return db.prepare("DELETE FROM domains WHERE id = ?").run(id);
}

// Close on process exit
process.on("exit", () => {
  try {
    db.close();
  } catch (e) {
    // ignore
  }
});

module.exports = {
  db,
  createProject,
  getProjectById,
  getProjectByName,
  listProjects,
  updateProject,
  deleteProject,
  createDeployment,
  getDeploymentById,
  listDeployments,
  updateDeployment,
  getNextVersion,
  setEnvVar,
  listEnvVars,
  deleteEnvVar,
  addDomain,
  listDomains,
  verifyDomain,
  deleteDomain,
  now,
  generateId,
};
