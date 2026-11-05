"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const initSqlJs = require("sql.js");

const DB_PATH = path.join(__dirname, "data", "platform.db");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDir(path.dirname(DB_PATH));

let db = null;
let initialized = false;
const initPromise = (async () => {
  const SQLModule = await initSqlJs();
  db = new SQLModule.Database();

  // Load existing database if present
  if (fs.existsSync(DB_PATH)) {
    const fileContents = fs.readFileSync(DB_PATH);
    db = new SQLModule.Database(fileContents);
  }

  initSchema();
  initialized = true;
})();

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

    CREATE TABLE IF NOT EXISTS repository_commits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sha TEXT NOT NULL,
      message TEXT,
      author_name TEXT,
      author_email TEXT,
      author_date TEXT,
      url TEXT,
      html_url TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, sha)
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_env_vars_project ON environment_variables(project_id);
    CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);
    CREATE INDEX IF NOT EXISTS idx_commits_project ON repository_commits(project_id);
  `);

  // Add GitHub columns to existing projects tables (migration)
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN github_repo_url TEXT;`);
  } catch (e) {
    // Column may already exist
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN github_token TEXT;`);
  } catch (e) {
    // Column may already exist
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN github_branch TEXT DEFAULT 'main';`);
  } catch (e) {
    // Column may already exist
  }
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN github_last_synced_at INTEGER;`);
  } catch (e) {
    // Column may already exist
  }

  saveDb();
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    // Ignore save errors
  }
}

function now() {
  return Date.now();
}

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const hasRow = stmt.step();
  if (!hasRow) {
    stmt.free();
    return undefined;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ---- Project operations ----

function createProject(name, description = "", framework = "static") {
  const id = generateId();
  const ts = now();
  run(
    "INSERT INTO projects (id, name, description, framework, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, description, framework, ts, ts]
  );
  saveDb();
  return getProjectById(id);
}

function getProjectById(id) {
  return get("SELECT * FROM projects WHERE id = ?", [id]);
}

function getProjectByName(name) {
  return get("SELECT * FROM projects WHERE name = ?", [name]);
}

function listProjects() {
  return all("SELECT * FROM projects ORDER BY created_at DESC");
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
  run(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`, values);
  saveDb();
  return getProjectById(id);
}

function deleteProject(id) {
  run("DELETE FROM projects WHERE id = ?", [id]);
  saveDb();
}

// ---- Deployment operations ----

function createDeployment(projectId, version, status = "pending") {
  const id = generateId();
  const ts = now();
  run(
    "INSERT INTO deployments (id, project_id, version, status, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, projectId, version, status, ts]
  );
  saveDb();
  return getDeploymentById(id);
}

function getDeploymentById(id) {
  return get("SELECT * FROM deployments WHERE id = ?", [id]);
}

function listDeployments(projectId) {
  return all(
    "SELECT * FROM deployments WHERE project_id = ? ORDER BY version DESC",
    [projectId]
  );
}

function updateDeployment(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  values.push(id);
  run(`UPDATE deployments SET ${fields.join(", ")} WHERE id = ?`, values);
  saveDb();
  return getDeploymentById(id);
}

function getNextVersion(projectId) {
  const row = get(
    "SELECT MAX(version) as maxVersion FROM deployments WHERE project_id = ?",
    [projectId]
  );
  return (row && row.maxVersion !== null ? row.maxVersion : 0) + 1;
}

// ---- Environment variable operations ----

function setEnvVar(projectId, key, value, type = "config", environment = "production") {
  const id = generateId();
  const ts = now();
  const existing = get(
    "SELECT id FROM environment_variables WHERE project_id = ? AND key = ? AND environment = ?",
    [projectId, key, environment]
  );

  if (existing) {
    run(
      "UPDATE environment_variables SET value = ?, type = ?, updated_at = ? WHERE id = ?",
      [value, type, ts, existing.id]
    );
    saveDb();
    return getEnvVarById(existing.id);
  }

  run(
    "INSERT INTO environment_variables (id, project_id, key, value, type, environment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, projectId, key, value, type, environment, ts, ts]
  );
  saveDb();
  return getEnvVarById(id);
}

function getEnvVarById(id) {
  return get("SELECT * FROM environment_variables WHERE id = ?", [id]);
}

function listEnvVars(projectId, environment) {
  if (environment) {
    return all(
      "SELECT id, key, type, environment, created_at, updated_at FROM environment_variables WHERE project_id = ? AND environment = ? ORDER BY key",
      [projectId, environment]
    );
  }
  return all(
    "SELECT id, key, type, environment, created_at, updated_at FROM environment_variables WHERE project_id = ? ORDER BY key",
    [projectId]
  );
}

function deleteEnvVar(id) {
  run("DELETE FROM environment_variables WHERE id = ?", [id]);
  saveDb();
}

// ---- Domain operations ----

function addDomain(projectId, name, environment = "production") {
  const id = generateId();
  const ts = now();
  run(
    "INSERT INTO domains (id, project_id, name, environment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, projectId, name, environment, ts, ts]
  );
  saveDb();
  return getDomainById(id);
}

function getDomainById(id) {
  return get("SELECT * FROM domains WHERE id = ?", [id]);
}

function listDomains(projectId) {
  return all(
    "SELECT * FROM domains WHERE project_id = ? ORDER BY created_at DESC",
    [projectId]
  );
}

function verifyDomain(id) {
  const ts = now();
  run(
    "UPDATE domains SET verified = 1, ssl_status = 'active', updated_at = ? WHERE id = ?",
    [ts, id]
  );
  saveDb();
  return getDomainById(id);
}

function deleteDomain(id) {
  run("DELETE FROM domains WHERE id = ?", [id]);
  saveDb();
}

// ---- GitHub commits ----

function setProjectGitHub(projectId, repoUrl, token, branch = "main") {
  const ts = now();
  run(
    "UPDATE projects SET github_repo_url = ?, github_token = ?, github_branch = ?, github_last_synced_at = ?, updated_at = ? WHERE id = ?",
    [repoUrl, token, branch, ts, ts, projectId]
  );
  saveDb();
  return getProjectById(projectId);
}

function upsertCommit(projectId, sha, message, authorName, authorEmail, authorDate, url, htmlUrl) {
  const id = generateId();
  const ts = now();
  const existing = get(
    "SELECT id FROM repository_commits WHERE project_id = ? AND sha = ?",
    [projectId, sha]
  );
  if (existing) {
    run(
      "UPDATE repository_commits SET message = ?, author_name = ?, author_email = ?, author_date = ?, url = ?, html_url = ? WHERE id = ?",
      [message, authorName, authorEmail, authorDate, url, htmlUrl, existing.id]
    );
    saveDb();
    return getCommitById(existing.id);
  }
  run(
    "INSERT INTO repository_commits (id, project_id, sha, message, author_name, author_email, author_date, url, html_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, projectId, sha, message, authorName, authorEmail, authorDate, url, htmlUrl, ts]
  );
  saveDb();
  return getCommitById(id);
}

function getCommitById(id) {
  return get("SELECT * FROM repository_commits WHERE id = ?", [id]);
}

function listCommits(projectId, limit = 50) {
  return all(
    "SELECT * FROM repository_commits WHERE project_id = ? ORDER BY author_date DESC LIMIT ?",
    [projectId, limit]
  );
}

function listAllCommits(limit = 100) {
  return all(
    `SELECT c.*, p.name as project_name 
     FROM repository_commits c 
     JOIN projects p ON p.id = c.project_id 
     ORDER BY c.author_date DESC LIMIT ?`,
    [limit]
  );
}

function deleteCommits(projectId) {
  run("DELETE FROM repository_commits WHERE project_id = ?", [projectId]);
  saveDb();
}

// Close on process exit
process.on("exit", () => {
  if (db) {
    try {
      saveDb();
      db.close();
    } catch (e) {
      // ignore
    }
  }
});

module.exports = {
  initPromise,
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
  run,
  setEnvVar,
  listEnvVars,
  deleteEnvVar,
  addDomain,
  listDomains,
  verifyDomain,
  deleteDomain,
  listCommits,
  listAllCommits,
  deleteCommits,
  now,
  generateId,
};
