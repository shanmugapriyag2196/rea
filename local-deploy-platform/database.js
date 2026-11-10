"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const initSqlJs = require("sql.js");

const IS_VERCEL = !!process.env.VERCEL;
const TMP_BASE = process.env.TMPDIR || process.env.TEMP || "/tmp";
const DB_PATH = process.env.DB_PATH || (IS_VERCEL ? path.join(TMP_BASE, "vg-platform.db") : path.join(__dirname, "data", "platform.db"));

function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    if (!IS_VERCEL) throw e;
  }
}

ensureDir(path.dirname(DB_PATH));

let db = null;
let initialized = false;
const initPromise = (async () => {
  // Locate sql.js wasm reliably in local and serverless bundles.
  let wasmBinary;
  try {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    wasmBinary = fs.readFileSync(wasmPath);
  } catch (e) {
    if (!IS_VERCEL) throw e;
    console.warn("[vg-deploy] sql-wasm.wasm not found in bundle; DB disabled on Vercel.", e.message);
    return;
  }
  const SQLModule = await initSqlJs({ wasmBinary });
  db = new SQLModule.Database();

  // Load existing database if present (best-effort; Vercel /tmp is ephemeral)
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileContents = fs.readFileSync(DB_PATH);
      db = new SQLModule.Database(fileContents);
    }
  } catch (e) {
    if (!IS_VERCEL) throw e;
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
      commit_sha TEXT,
      branch TEXT,
      environment TEXT DEFAULT 'production',
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

  // Integration/config tables (local-only dashboard integration layer)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS integration_mappings (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        local_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        remote_id TEXT,
        remote_key TEXT,
        meta TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(provider, local_type, local_id)
      );
      CREATE TABLE IF NOT EXISTS integration_sync_state (
        provider TEXT PRIMARY KEY,
        last_sync_at INTEGER,
        last_status TEXT,
        last_error TEXT,
        last_summary TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
  } catch (e) {}

  // Add GitHub/integration columns to existing projects tables (migration)
  try { db.exec(`ALTER TABLE projects ADD COLUMN github_repo_url TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN github_token TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN github_branch TEXT DEFAULT 'main';`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN github_last_synced_at INTEGER;`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN slug TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN vercel_project_id TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN vercel_team_id TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE deployments ADD COLUMN commit_sha TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE deployments ADD COLUMN branch TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE deployments ADD COLUMN environment TEXT DEFAULT 'production';`); } catch (e) {}

  // Backfill slugs for existing projects
  try {
    const rows = all("SELECT id, name, slug FROM projects");
    for (const r of rows || []) {
      if (!r.slug) {
        run("UPDATE projects SET slug = ? WHERE id = ?", [slugify(r.name || r.id), r.id]);
      }
    }
  } catch (e) {}

  saveDb();
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    // Ignore save errors (e.g. read-only serverless filesystem)
  }
}

function now() {
  return Date.now();
}

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

function slugify(value) {
  const s = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || `project-${generateId().slice(0, 8)}`;
}

function run(sql, params = []) {
  if (!db) return;
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function get(sql, params = []) {
  if (!db) return undefined;
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
  if (!db) return [];
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
  const slug = slugify(name);
  try {
    run(
      "INSERT INTO projects (id, name, slug, description, framework, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, name, slug, description, framework, ts, ts]
    );
  } catch (e) {
    run(
      "INSERT INTO projects (id, name, description, framework, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, description, framework, ts, ts]
    );
  }
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

function createDeployment(projectId, version, status = "pending", opts = {}) {
  const id = generateId();
  const ts = now();
  const commitSha = opts.commitSha || opts.commit_sha || null;
  const branch = opts.branch || null;
  const environment = opts.environment || "production";
  run(
    "INSERT INTO deployments (id, project_id, version, status, commit_sha, branch, environment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, projectId, version, status, commitSha, branch, environment, ts]
  );
  saveDb();
  return getDeploymentById(id);
}

function getDeploymentByCommit(projectId, commitSha) {
  if (!projectId || !commitSha) return null;
  return get(
    "SELECT * FROM deployments WHERE project_id = ? AND commit_sha = ? ORDER BY created_at DESC LIMIT 1",
    [projectId, commitSha]
  );
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

function listAllCommits(limit) {
  if (limit == null) {
    return all(
      `SELECT c.*, p.name as project_name 
       FROM repository_commits c 
       JOIN projects p ON p.id = c.project_id 
       ORDER BY c.author_date DESC`
    );
  }
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

// ---- Integration settings/mappings (local-only) ----

function maskSecret(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function getSetting(key) {
  const row = get("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row ? row.value : null;
}

function setSetting(key, value) {
  run(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value == null ? null : String(value), now()]
  );
  saveDb();
}

function getSettings(keys) {
  const out = {};
  for (const k of keys || []) out[k] = getSetting(k);
  return out;
}

function getIntegrationConfig(provider) {
  const prefix = `${provider}.`;
  const rows = all("SELECT key, value FROM app_settings WHERE key LIKE ?", [`${prefix}%`]);
  const cfg = {};
  for (const r of rows || []) cfg[r.key.slice(prefix.length)] = r.value;
  return cfg;
}

function setIntegrationConfig(provider, config) {
  for (const [k, v] of Object.entries(config || {})) {
    setSetting(`${provider}.${k}`, v);
  }
  return getIntegrationConfig(provider);
}

function getSyncState(provider) {
  return get("SELECT * FROM integration_sync_state WHERE provider = ?", [provider]) || null;
}

function setSyncState(provider, { status, error, summary }) {
  const ts = now();
  const existing = getSyncState(provider);
  if (existing) {
    run(
      "UPDATE integration_sync_state SET last_sync_at = ?, last_status = ?, last_error = ?, last_summary = ?, updated_at = ? WHERE provider = ?",
      [ts, status || null, error || null, summary || null, ts, provider]
    );
  } else {
    run(
      "INSERT INTO integration_sync_state (provider, last_sync_at, last_status, last_error, last_summary, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [provider, ts, status || null, error || null, summary || null, ts]
    );
  }
  saveDb();
  return getSyncState(provider);
}

function upsertMapping(provider, localType, localId, remoteId, remoteKey, meta) {
  const ts = now();
  const existing = get(
    "SELECT id FROM integration_mappings WHERE provider = ? AND local_type = ? AND local_id = ?",
    [provider, localType, localId]
  );
  const metaJson = meta == null ? null : JSON.stringify(meta);
  if (existing) {
    run(
      "UPDATE integration_mappings SET remote_id = ?, remote_key = ?, meta = ?, updated_at = ? WHERE id = ?",
      [remoteId || null, remoteKey || null, metaJson, ts, existing.id]
    );
    return get("SELECT * FROM integration_mappings WHERE id = ?", [existing.id]);
  }
  const id = generateId();
  run(
    "INSERT INTO integration_mappings (id, provider, local_type, local_id, remote_id, remote_key, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, provider, localType, localId, remoteId || null, remoteKey || null, metaJson, ts, ts]
  );
  saveDb();
  return get("SELECT * FROM integration_mappings WHERE id = ?", [id]);
}

function getMapping(provider, localType, localId) {
  return get(
    "SELECT * FROM integration_mappings WHERE provider = ? AND local_type = ? AND local_id = ?",
    [provider, localType, localId]
  );
}

function listMappings(provider, localType) {
  if (localType) {
    return all("SELECT * FROM integration_mappings WHERE provider = ? AND local_type = ? ORDER BY updated_at DESC", [provider, localType]);
  }
  return all("SELECT * FROM integration_mappings WHERE provider = ? ORDER BY updated_at DESC", [provider]);
}

function getPublicIntegrationConfig(provider) {
  const cfg = getIntegrationConfig(provider);
  const out = { ...cfg };
  if (out.pat) { out.patMasked = maskSecret(out.pat); delete out.pat; }
  if (out.token) { out.tokenMasked = maskSecret(out.token); delete out.token; }
  if (out.github_token) { out.github_tokenMasked = maskSecret(out.github_token); delete out.github_token; }
  out.configured = provider === "airtable" ? !!(cfg.pat && cfg.baseId) : !!(cfg.token);
  out.sync = getSyncState(provider);
  return out;
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
  setProjectGitHub,
  upsertCommit,
  getCommitById,
  listCommits,
  listAllCommits,
  deleteCommits,
  getDeploymentByCommit,
  getSetting,
  setSetting,
  getSettings,
  getIntegrationConfig,
  setIntegrationConfig,
  getPublicIntegrationConfig,
  getSyncState,
  setSyncState,
  upsertMapping,
  getMapping,
  listMappings,
  maskSecret,
  slugify,
  now,
  generateId,
};
