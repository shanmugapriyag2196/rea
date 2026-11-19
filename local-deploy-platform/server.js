"use strict";

const express = require("express");
const { spawn, spawnSync, execSync } = require("child_process");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

const {
  initPromise,
  createProject,
  getProjectById,
  getProjectByName,
  listProjects,
  updateProject,
  deleteProject,
  createDeployment,
  getDeploymentById,
  getDeploymentByCommit,
  listDeployments,
  updateDeployment,
  getNextVersion,
  run,
  get,
  all,
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
  getAirtableConfig,
  getPublicAirtableConfig,
  setAirtableConfig,
  now,
  generateId,
} = require("./database");

const IS_VERCEL = !!process.env.VERCEL;
const PORT = parseInt(process.env.PORT, 10) || 3456;
const HOST = process.env.HOST || "127.0.0.1";
const TMP_BASE = process.env.TMPDIR || process.env.TEMP || "/tmp";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || (IS_VERCEL ? path.join(TMP_BASE, "vg-workspaces") : path.join(__dirname, "workspaces"));
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || (IS_VERCEL ? path.join(TMP_BASE, "vg-deployments") : path.join(__dirname, "public", "deployments"));
const LOG_DIR = process.env.LOG_DIR || (IS_VERCEL ? path.join(TMP_BASE, "vg-logs") : path.join(__dirname, "logs"));
const BUILD_TIMEOUT_MS = parseInt(process.env.BUILD_TIMEOUT_MS, 10) || 300000;
const BUILD_MAX_MEMORY_MB = parseInt(process.env.BUILD_MAX_MEMORY_MB, 10) || 512;

function ensureWritableDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (!IS_VERCEL) throw e;
    console.warn(`[vg-deploy] Could not create dir ${dir}: ${e.message}`);
  }
}

for (const dir of [WORKSPACE_DIR, ARTIFACT_DIR, LOG_DIR]) {
  ensureWritableDir(dir);
}

async function fetchCommitsFromGitHub(owner, repo, token, branch = "main", perPage = 100) {
  const commits = [];
  let page = 1;
  let hasMore = true;
  const authToken = (token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();

  while (hasMore) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`;
    const headers = {
      "User-Agent": "VG-Deploy-Platform",
      Accept: "application/vnd.github+json",
    };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      let detail = "";
      try { const body = await response.json(); detail = body && body.message ? String(body.message) : ""; } catch {}
      const err = new Error(detail || `GitHub API error: ${response.status} ${response.statusText}`);
      err.status = response.status;
      err.code = "GITHUB_API_ERROR";
      throw err;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit?.message || "",
        authorName: c.commit?.author?.name || c.author?.login || "Unknown",
        authorEmail: c.commit?.author?.email || "",
        authorDate: c.commit?.author?.date || "",
        url: c.url,
        htmlUrl: c.html_url,
      });
    }

    if (data.length < perPage) hasMore = false;
    else page++;
  }

  return commits;
}

async function verifyGitHubRepoAccess(owner, repo, token) {
  const authToken = (token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const headers = {
    "User-Agent": "VG-Deploy-Platform",
    Accept: "application/vnd.github+json",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(body && body.message ? String(body.message) : `GitHub API error: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.code = "GITHUB_REPO_ACCESS";
    throw err;
  }
  return body || {};
}

function parseGitHubRepoUrl(repoUrl) {
  try {
    const raw = String(repoUrl || "").trim();
    if (!raw) return null;
    let u;
    try {
      u = new URL(raw);
    } catch {
      // try https prefix for bare github.com/... or owner/repo not supported; require full URL
      return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.hostname.toLowerCase() !== "github.com" && u.hostname.toLowerCase() !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    let repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

async function importCommitsViaGitHubApi(projectId, repoUrl, token, branch = "main") {
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!parsed) {
    const err = new Error("Invalid GitHub repository URL. Use https://github.com/owner/repo");
    err.status = 400;
    err.code = "INVALID_REPO_URL";
    throw err;
  }
  const authToken = (token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const commits = await fetchCommitsFromGitHub(parsed.owner, parsed.repo, authToken, branch);
  for (const c of commits) {
    upsertCommit(projectId, c.sha, c.message, c.authorName, c.authorEmail, c.authorDate, c.url, c.htmlUrl);
  }
  return { commits, count: commits.length };
}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Ensure tmp upload dir exists
const tmpUploadDir = IS_VERCEL ? path.join(TMP_BASE, "vg-tmp-uploads") : path.join(__dirname, "logs", "tmp-uploads");
ensureWritableDir(tmpUploadDir);

// Multer config for ZIP uploads
const upload = multer({
  dest: tmpUploadDir,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".zip") {
      cb(null, true);
    } else {
      cb(new Error("Only .zip archives are allowed"), false);
    }
  },
});
// ---------- Helpers ----------

function isSafeZipEntry(entryName) {
  const normalized = path.normalize(entryName);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return false;
  }
  const parts = normalized.split(path.sep);
  for (const part of parts) {
    if (part === "..") return false;
  }
  return true;
}

async function downloadGitHubZipball(owner, repo, ref, token, destPath) {
  const authToken = (token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(ref)}`;
  const headers = { "User-Agent": "VG-Deploy-Platform", Accept: "application/vnd.github+json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j && j.message ? String(j.message) : ""; } catch {}
    const err = new Error(detail || `GitHub archive download failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

function extractZipStrippingRoot(zipPath, destDir) {
  safeExtractZip(zipPath, destDir);
  const entries = fs.readdirSync(destDir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const root = path.join(destDir, entries[0].name);
    for (const item of fs.readdirSync(root)) {
      fs.renameSync(path.join(root, item), path.join(destDir, item));
    }
    try { fs.rmdirSync(root); } catch {}
  }
  return countFilesAndSize(destDir);
}

// ---------- Airtable integration (dashboard data) ----------
async function airtableFetchAllRecords(cfg, tableId) {
  if (!cfg.pat) throw new Error("Airtable Personal Access Token is not configured. Add it in Settings or Vercel env (AIRTABLE_PAT).");
  if (!cfg.baseId || !tableId) throw new Error("Airtable Base ID / Table ID not configured.");
  const records = [];
  let offset = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL(`https://api.airtable.com/v0/${cfg.baseId}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.pat}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.type || `Airtable API error ${res.status}`;
      throw new Error(msg);
    }
    for (const r of data.records || []) records.push(r);
    if (!data.offset) break;
    offset = data.offset;
  }
  return records;
}

async function airtableCreateRecords(cfg, tableId, records) {
  if (!cfg.pat) throw new Error("Airtable PAT not configured");
  if (!cfg.baseId || !tableId) throw new Error("Airtable Base/Table ID not configured");
  const created = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10).map((fields) => ({ fields }));
    const url = `https://api.airtable.com/v0/${cfg.baseId}/${tableId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.type || `Airtable create error ${res.status}`;
      throw new Error(msg);
    }
    for (const r of data.records || []) created.push(r);
  }
  return created;
}

async function airtableUpdateRecords(cfg, tableId, records) {
  if (!cfg.pat) throw new Error("Airtable PAT not configured");
  if (!cfg.baseId || !tableId) throw new Error("Airtable Base/Table ID not configured");
  const updated = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10).map((r) => ({ id: r.id, fields: r.fields }));
    const url = `https://api.airtable.com/v0/${cfg.baseId}/${tableId}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${cfg.pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.type || `Airtable update error ${res.status}`;
      throw new Error(msg);
    }
    for (const r of data.records || []) updated.push(r);
  }
  return updated;
}

function toAirtableDate(ts) {
  if (!ts) return undefined;
  try {
    if (typeof ts === "number") return new Date(ts).toISOString();
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return undefined;
}

async function syncProjectToAirtable(project, repoUrl) {
  const cfg = getAirtableConfig();
  if (!cfg.pat || !cfg.projectsTableId) return { skipped: true, reason: "Airtable PAT or Projects table ID not configured" };
  const fields = {
    Name: project.name || "",
    URL: repoUrl || project.github_repo_url || "",
    Framework: project.framework || "static",
  };
  const createdAt = toAirtableDate(project.created_at);
  if (createdAt) fields.CreatedAt = createdAt;
  const recs = await airtableCreateRecords(cfg, cfg.projectsTableId, [fields]);
  return { ok: true, count: recs.length };
}

async function syncCommitsToAirtable(commits, projectName) {
  const cfg = getAirtableConfig();
  if (!cfg.pat || !cfg.commitsTableId) return { skipped: true, reason: "Airtable PAT or Commits table ID not configured" };
  const incoming = (commits || []).filter(c => c && c.sha);
  if (!incoming.length) return { ok: true, count: 0, created: 0, skippedExisting: 0 };

  // Dedupe: avoid creating duplicate commits for the same project
  let existing = new Set();
  try {
    const all = await airtableFetchAllRecords(cfg, cfg.commitsTableId);
    for (const r of all) {
      const f = r.fields || {};
      const hash = String(af(f, "CommitHash", "Commit Hash", "Commit", "SHA") || "").trim();
      const pn = String(af(f, "ProjectName", "Project Name", "Project") || "").trim();
      if (hash && pn && pn === String(projectName || "").trim()) existing.add(hash);
    }
  } catch (e) {
    // If dedupe check fails, proceed without dedupe but surface later if create fails
    existing = new Set();
  }

  const records = incoming
    .filter((c) => !existing.has(String(c.sha).trim()))
    .map((c) => {
      const fields = {
        CommitHash: c.sha,
        CommitMessage: c.message || "",
        Author: c.authorName || c.author_name || "",
        ProjectName: projectName || c.projectName || "",
      };
      const ts = toAirtableDate(c.authorDate || c.author_date);
      if (ts) fields.Timestamp = ts;
      return fields;
    });

  if (!records.length) return { ok: true, count: 0, created: 0, skippedExisting: incoming.length };
  const recs = await airtableCreateRecords(cfg, cfg.commitsTableId, records);
  return { ok: true, count: recs.length, created: recs.length, skippedExisting: incoming.length - records.length, total: incoming.length };
}

function airtableDeploymentId(sha) {
  return `dpl_${String(sha || "").trim()}`;
}

function slugifyProjectName(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "deployment";
}

function deploymentAlias(projectName, sha) {
  const full = String(sha || "").trim();
  const short = full ? full.slice(0, 7) : Math.random().toString(16).slice(2, 9);
  return `${slugifyProjectName(projectName)}-${short}`;
}

function mapAirtableDeployment(rec, { sha, projectName } = {}) {
  const f = (rec && rec.fields) || {};
  const depId = String(af(f, "DeploymentId", "Deployment ID", "Id", "ID") || "").trim() || (rec && rec.id) || "";
  const status = normalizeAirtableStatus(af(f, "Status", "status"));
  const createdRaw = af(f, "CreatedAt", "Created At", "Timestamp", "Date");
  const createdMs = createdRaw ? new Date(createdRaw).getTime() : NaN;
  const durRaw = af(f, "Duration", "BuildDurationMs", "DurationMs", "duration");
  const durationMs = Number(String(durRaw).replace(/[^0-9.]/g, "")) || 0;
  const commitSha = String(sha || af(f, "CommitHash", "Commit Hash", "Commit", "SHA") || "").trim();
  const alias = deploymentAlias(projectName, commitSha);
  return {
    id: depId || (rec && rec.id) || "",
    alias,
    airtableRecordId: rec && rec.id,
    status,
    commit_sha: commitSha,
    branch: af(f, "Branch", "branch") || "main",
    created_at: Number.isFinite(createdMs) ? createdMs : Date.now(),
    build_duration_ms: durationMs,
    environment: af(f, "Environment", "environment") || "production",
    url_path: `/deployments/${encodeURIComponent(depId || (rec && rec.id) || "")}`,
    source: "airtable",
  };
}

async function ensureAirtableDeployment(project, sha, branch, commit) {
  const cfg = getAirtableConfig();
  if (!cfg.pat || !cfg.deploymentsTableId) return null;
  const deploymentId = airtableDeploymentId(sha);
  const all = await airtableFetchAllRecords(cfg, cfg.deploymentsTableId);
  const existing = (all || []).find((r) => {
    const f = r.fields || {};
    return String(af(f, "DeploymentId", "Deployment ID", "Id", "ID") || "").trim() === deploymentId;
  });
  if (existing) return mapAirtableDeployment(existing, { sha, projectName: project && project.name });

  const repoUrl = (project && (project.github_repo_url || project.repositoryUrl)) || "";
  const parsed = parseGitHubRepoUrl(repoUrl);
  const fields = {
    DeploymentId: deploymentId,
    ProjectName: (project && project.name) || "",
    Status: "ready",
    Branch: branch || "main",
    Duration: commit && commit.build_duration_ms ? Number(commit.build_duration_ms) : 0,
    BuildLogs: commit && commit.message ? String(commit.message).split("\n")[0] : "Imported from commit",
  };
  if (parsed) fields.ArtifactPath = `https://github.com/${parsed.owner}/${parsed.repo}/commit/${sha}`;
  const created = await airtableCreateRecords(cfg, cfg.deploymentsTableId, [fields]);
  return created && created[0] ? mapAirtableDeployment(created[0], { sha, projectName: project && project.name }) : null;
}

function af(fields, ...names) {
  for (const n of names) {
    if (fields[n] !== undefined && fields[n] !== null && fields[n] !== "") return fields[n];
  }
  return "";
}

function normalizeAirtableStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "ready") return "ready";
  if (s === "building") return "building";
  if (s === "failed" || s === "error") return "error";
  if (s === "success") return "ready";
  return s || "unknown";
}

function parseZipBuffer(buffer) {
  const entries = [];
  let offset = 0;
  const maxLen = buffer.length;

  while (offset < maxLen - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > maxLen) break;

    const fileName = buffer.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    entries.push({
      name: fileName,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      dataStart,
      dataEnd,
    });

    offset = dataEnd;
  }

  return entries;
}

function safeExtractZip(zipPath, destDir) {
  const MAX_FILES = 60000;
  const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1 GB
  // Skip vendored/dependency trees: they are never part of a static deploy and
  // inflate archives massively (a committed node_modules can add tens of thousands of files).
  const SKIP_SEGMENTS = new Set(["node_modules", ".git", ".cache", ".next", ".turbo"]);

  const fd = fs.openSync(zipPath, "r");
  const stat = fs.fstatSync(fd);
  const buffer = Buffer.alloc(stat.size);
  fs.readSync(fd, buffer, 0, stat.size, 0);
  fs.closeSync(fd);

  const entries = parseZipBuffer(buffer);
  const extracted = [];
  let totalSize = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (!isSafeZipEntry(entry.name)) {
      throw new Error(`Unsafe ZIP entry detected: ${entry.name}`);
    }

    if (entry.name.endsWith("/") || entry.name.endsWith("\\")) {
      continue;
    }

    const segments = entry.name.split(/[\\/]+/).filter(Boolean);
    if (segments.some((seg) => SKIP_SEGMENTS.has(seg))) {
      continue;
    }

    const targetPath = path.join(destDir, entry.name);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (entry.compressionMethod === 0) {
      fs.writeFileSync(targetPath, buffer.slice(entry.dataStart, entry.dataEnd));
    } else if (entry.compressionMethod === 8) {
      const compressed = buffer.slice(entry.dataStart, entry.dataEnd);
      try {
        const decompressed = zlib.inflateRawSync(compressed);
        fs.writeFileSync(targetPath, decompressed);
      } catch (err) {
        throw new Error(`Failed to decompress entry ${entry.name}: ${err.message}`);
      }
    } else {
      throw new Error(`Unsupported compression method ${entry.compressionMethod} for ${entry.name}`);
    }

    const entryStat = fs.statSync(targetPath);
    totalSize += entryStat.size;
    fileCount++;

    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(`Archive exceeds maximum total size of ${MAX_TOTAL_SIZE} bytes`);
    }

    if (fileCount > MAX_FILES) {
      throw new Error(`Too many files: ${fileCount} (max ${MAX_FILES})`);
    }

    extracted.push({ name: entry.name, size: entryStat.size });
  }

  return { extracted, fileCount, totalSize };
}

function countFilesAndSize(dir) {
  let count = 0;
  let totalSize = 0;

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        count++;
        totalSize += fs.statSync(fullPath).size;
      }
    }
  }

  walk(dir);
  return { count, totalSize };
}

// ---------- Middleware: Security headers ----------
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ---------- API Routes ----------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: now() });
});

// ---- Projects ----
app.get("/api/projects", (req, res) => {
  try {
    const projects = listProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: "Failed to list projects", message: err.message });
  }
});

app.post("/api/projects", (req, res) => {
  try {
    const { name, description, framework } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const trimmed = name.trim();
    if (trimmed.length > 100) {
      return res.status(400).json({ error: "Project name must be 100 characters or fewer" });
    }

    // Prevent path traversal and unsafe characters
    if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) {
      return res.status(400).json({ error: "Project name contains invalid characters" });
    }

    if (getProjectByName(trimmed)) {
      return res.status(409).json({ error: "Project with this name already exists" });
    }

    const project = createProject(trimmed, description || "", framework || "static");

    // Create project workspace directory
    const projectWorkspace = path.join(WORKSPACE_DIR, project.id);
    fs.mkdirSync(projectWorkspace, { recursive: true });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to create project", message: err.message });
  }
});

app.get("/api/projects/:projectId", (req, res) => {
  try {
    const project = getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: "Failed to get project", message: err.message });
  }
});

app.put("/api/projects/:projectId", (req, res) => {
  try {
    const project = getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { name, description, framework, build_command, output_directory, root_directory } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (framework !== undefined) updates.framework = framework;
    if (build_command !== undefined) updates.build_command = build_command;
    if (output_directory !== undefined) updates.output_directory = output_directory;
    if (root_directory !== undefined) updates.root_directory = root_directory;

    const updated = updateProject(req.params.projectId, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update project", message: err.message });
  }
});

app.delete("/api/projects/:projectId", (req, res) => {
  try {
    const project = getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    deleteProject(req.params.projectId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete project", message: err.message });
  }
});

// ---- Deployments ----
app.post("/api/projects/:projectId/deployments", upload.single("zip"), async (req, res) => {
  try {
    const project = getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No ZIP file provided" });
    }

    const version = getNextVersion(req.params.projectId);
    const deployment = createDeployment(req.params.projectId, version, "pending");

    // Create deployment artifact directory
    const deployArtifactDir = path.join(ARTIFACT_DIR, deployment.id);
    fs.mkdirSync(deployArtifactDir, { recursive: true });

    // Mark deployment as building
    updateDeployment(deployment.id, { status: "building", build_started_at: now() });

    // Extract ZIP safely
    try {
      const { extracted, fileCount, totalSize } = safeExtractZip(
        req.file.path,
        deployArtifactDir
      );

      // Serve health check
      const indexPath = path.join(deployArtifactDir, "index.html");
      const hasIndex = fs.existsSync(indexPath);

      const updated = updateDeployment(deployment.id, {
        status: "ready",
        build_completed_at: now(),
        build_duration_ms: now() - deployment.created_at,
        file_count: fileCount,
        total_size: totalSize,
        url_path: `/deployments/${deployment.id}`,
        artifact_path: deployArtifactDir,
        log_path: `/api/deployments/${deployment.id}/logs`,
        error_message: null,
      });

      res.status(201).json({
        ...updated,
        version,
        url: `http://${HOST}:${PORT}/deployments/${deployment.id}/`,
      });
    } catch (extractErr) {
      // Clean up on failure
      try { fs.rmSync(deployArtifactDir, { recursive: true, force: true }); } catch (e) {}
      try { fs.unlinkSync(req.file.path); } catch (e) {}

      updateDeployment(deployment.id, {
        status: "error",
        build_completed_at: now(),
        error_message: extractErr.message,
      });

      res.status(422).json({
        error: "Deployment failed",
        message: extractErr.message,
        deploymentId: deployment.id,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to create deployment", message: err.message });
  }
});

app.get("/api/deployments", (req, res) => {
  try {
    const { projectId } = req.query;
    if (projectId) {
      const project = getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      const deployments = listDeployments(projectId);
      return res.json(deployments);
    }
    // If no projectId, return all deployments
    const allProjects = listProjects();
    const allDeployments = [];
    for (const project of allProjects) {
      const deps = listDeployments(project.id);
      deps.forEach((d) => {
        d.projectName = project.name;
        allDeployments.push(d);
      });
    }
    allDeployments.sort((a, b) => b.created_at - a.created_at);
    res.json(allDeployments);
  } catch (err) {
    res.status(500).json({ error: "Failed to list deployments", message: err.message });
  }
});

app.get("/api/deployments/:deploymentId", (req, res) => {
  try {
    const deployment = getDeploymentById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ error: "Deployment not found" });
    }
    const project = getProjectById(deployment.project_id);
    const domains = project ? listDomains(project.id) : [];
    let commit = null;
    if (deployment.commit_sha && project) {
      commit = get("SELECT * FROM repository_commits WHERE project_id = ? AND sha = ? LIMIT 1", [project.id, deployment.commit_sha]);
    }
    res.json({ ...deployment, project, domains, commit });
  } catch (err) {
    res.status(500).json({ error: "Failed to get deployment", message: err.message });
  }
});

app.get("/api/projects/:projectId/commits/:sha/deployment", async (req, res) => {
  const { projectId, sha } = req.params;
  const nameHint = req.query.projectName ? String(req.query.projectName).trim() : "";
  const repoUrlHint = req.query.repoUrl ? String(req.query.repoUrl).trim() : "";
  const branchHint = req.query.branch ? String(req.query.branch).trim() : "";
  const safe = (fn, fallback) => {
    try { return fn(); } catch (e) {
      console.warn("[vg-deploy] commit-deployment local lookup failed:", e.message);
      return fallback;
    }
  };

  // Local DB path (works locally). Each lookup is guarded so a cold/ephemeral
  // Vercel SQLite DB can never turn this endpoint into a 500.
  let project = safe(() => getProjectById(projectId), undefined);
  if (!project && nameHint) project = safe(() => getProjectByName(nameHint), undefined);
  if (!project && nameHint) {
    project = safe(() => createProject(nameHint, "Imported project", "static"), undefined)
      || safe(() => getProjectByName(nameHint), undefined);
  }
  if (project && repoUrlHint && !project.github_repo_url) {
    try {
      setProjectGitHub(project.id, repoUrlHint, "", project.github_branch || "main");
      project = safe(() => getProjectById(project.id), project) || project;
    } catch (e) { console.warn("[vg-deploy] setProjectGitHub failed:", e.message); }
  }
  let deployment = project ? safe(() => getDeploymentByCommit(project.id, sha), null) : null;
  let commit = project ? safe(() => get("SELECT * FROM repository_commits WHERE project_id = ? AND sha = ? LIMIT 1", [project.id, sha]), null) : null;

  // Airtable path (works on Vercel where the SQLite DB is ephemeral).
  let airProject = null;
  let airCommit = null;
  if (!project || !deployment || !commit) {
    try {
      const cfg = getAirtableConfig();
      if (cfg.pat && nameHint) {
        if (!project) {
          const projects = await airtableFetchAllRecords(cfg, cfg.projectsTableId);
          const p = projects.find((r) => String(af(r.fields || {}, "Name", "ProjectName", "Project Name") || "").trim() === nameHint);
          if (p) {
            const f = p.fields || {};
            airProject = {
              id: p.id,
              name: nameHint,
              repositoryUrl: af(f, "URL", "Repository URL", "RepositoryUrl", "Repo URL", "RepoURL"),
              framework: af(f, "Framework", "framework"),
              created_at: af(f, "CreatedAt", "Created At", "Created"),
            };
          }
        }
        if (!commit && cfg.commitsTableId) {
          const commits = await airtableFetchAllRecords(cfg, cfg.commitsTableId);
          const c = commits.find((r) => {
            const f = r.fields || {};
            return String(af(f, "ProjectName", "Project Name", "Project") || "").trim() === nameHint
              && String(af(f, "CommitHash", "Commit Hash", "Commit", "SHA") || "").trim() === String(sha).trim();
          });
          if (c) {
            const f = c.fields || {};
            airCommit = {
              sha,
              message: af(f, "CommitMessage", "Commit Message", "Message"),
              author_name: af(f, "Author", "author"),
              author_date: af(f, "Timestamp", "timestamp"),
            };
          }
        }
        if (!deployment) {
          const branch = branchHint || (project && project.github_branch) || "main";
          deployment = await ensureAirtableDeployment(project || airProject || { name: nameHint }, sha, branch, commit || airCommit);
        }
      }
    } catch (e) {
      console.warn("[vg-deploy] commit-deployment airtable lookup failed:", e.message);
    }
  }

  const projectOut = project || airProject || { id: projectId, name: nameHint, repositoryUrl: repoUrlHint, framework: "static" };
  if (!projectOut || !projectOut.name) {
    return res.status(404).json({ error: "Project not found. Re-import the project or provide a project name." });
  }
  const commitOut = commit || airCommit || { sha, message: "", author_name: "", author_date: "" };

  if (!deployment && IS_VERCEL) {
    // Synthetic (not persisted) so the UI can render details without forcing a heavy build.
    deployment = {
      id: airtableDeploymentId(sha),
      alias: deploymentAlias(projectOut.name, sha),
      status: "ready",
      commit_sha: sha,
      branch: branchHint || projectOut.github_branch || "main",
      created_at: Date.now(),
      build_duration_ms: 0,
      environment: "production",
      file_count: 0,
      total_size: 0,
      source: "synthetic",
      persisted: false,
    };
  }
  if (deployment) {
    deployment.project = projectOut;
    deployment.commit = commitOut;
    if (!deployment.alias) deployment.alias = deploymentAlias(projectOut.name, deployment.commit_sha || sha);
    if (!deployment.url) {
      const repoForUrl = projectOut.github_repo_url || projectOut.repositoryUrl || repoUrlHint || "";
      deployment.url = `/deployments/${encodeURIComponent(deployment.alias)}/` + (repoForUrl ? `?repoUrl=${encodeURIComponent(repoForUrl)}` : "");
    }
  }
  res.json({ deployment: deployment || null, commit: commitOut, project: projectOut });
});

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

app.post("/api/projects/:projectId/deploy-commit", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sha, branch, projectName, repoUrl, githubToken } = req.body || {};
    if (!sha || typeof sha !== "string") return res.status(400).json({ error: "Commit SHA is required" });

    let project = getProjectById(projectId);
    const nameHint = typeof projectName === "string" ? projectName.trim() : "";
    if (!project && nameHint) project = getProjectByName(nameHint);
    if (!project && nameHint) {
      try { project = createProject(nameHint, "Imported project", "static"); }
      catch { project = getProjectByName(nameHint); }
    }
    if (!project) return res.status(404).json({ error: "Project not found" });

    const resolvedRepoUrl = String(repoUrl || project.github_repo_url || "").trim();
    if (resolvedRepoUrl && !project.github_repo_url) {
      try { setProjectGitHub(project.id, resolvedRepoUrl, "", branch || project.github_branch || "main"); project = getProjectById(project.id) || project; } catch {}
    }

    const existing = getDeploymentByCommit(project.id, sha);
    if (existing) {
      const commit = get("SELECT * FROM repository_commits WHERE project_id = ? AND sha = ? LIMIT 1", [project.id, sha]);
      return res.json({ deployment: existing, reused: true, commit, project });
    }

    const version = getNextVersion(project.id);
    const deployment = createDeployment(project.id, version, "building", { commitSha: sha, branch: branch || project.github_branch || "main", environment: "production" });
    const deployArtifactDir = path.join(ARTIFACT_DIR, deployment.id);
    ensureWritableDir(deployArtifactDir);
    updateDeployment(deployment.id, { status: "building", build_started_at: now() });

    try {
      const tmpZip = path.join(LOG_DIR, `tmp-deploy-${deployment.id}.zip`);
      try { fs.rmSync(tmpZip, { force: true }); } catch {}

      let extracted = false;
      const repoDir = path.join(WORKSPACE_DIR, project.id, "repo");
      if (fs.existsSync(path.join(repoDir, ".git"))) {
        const archive = spawnSync("git", ["-C", repoDir, "archive", "--format=zip", "-o", tmpZip, sha], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
        if (archive.status === 0 && fs.existsSync(tmpZip)) {
          safeExtractZip(tmpZip, deployArtifactDir);
          extracted = true;
        }
      }

      if (!extracted) {
        const parsed = parseGitHubRepoUrl(resolvedRepoUrl);
        if (!parsed) throw new Error("Cannot deploy commit: no local git repo and repository URL is missing or not a valid GitHub URL.");
        const authToken = (typeof githubToken === "string" ? githubToken : "").trim() || (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
        await downloadGitHubZipball(parsed.owner, parsed.repo, sha, authToken, tmpZip);
        extractZipStrippingRoot(tmpZip, deployArtifactDir);
      }

      try { fs.rmSync(tmpZip, { force: true }); } catch {}

      const { count: fileCount, totalSize } = countFilesAndSize(deployArtifactDir);
      const updated = updateDeployment(deployment.id, {
        status: "ready",
        build_completed_at: now(),
        build_duration_ms: Math.max(0, now() - (deployment.created_at || now())),
        file_count: fileCount,
        total_size: totalSize,
        url_path: `/deployments/${deployment.id}`,
        artifact_path: deployArtifactDir,
        log_path: `/api/deployments/${deployment.id}/logs`,
        error_message: null,
      });
      const commit = get("SELECT * FROM repository_commits WHERE project_id = ? AND sha = ? LIMIT 1", [project.id, sha]);
      try { await ensureAirtableDeployment(project, sha, branch || project.github_branch || "main", updated); }
      catch (e) { console.warn("[vg-deploy] deployment airtable sync failed:", e.message); }
      res.status(201).json({ deployment: updated, reused: false, project, commit, url: `/deployments/${updated.id}/` });
    } catch (e) {
      try { fs.rmSync(deployArtifactDir, { recursive: true, force: true }); } catch {}
      updateDeployment(deployment.id, { status: "error", build_completed_at: now(), error_message: e.message });
      res.status(422).json({ error: "Deploy from commit failed", message: e.message, deploymentId: deployment.id });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to deploy commit", message: err.message });
  }
});

app.post("/api/deployments/:deploymentId/rollback", (req, res) => {
  try {
    const deployment = getDeploymentById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    if (deployment.status !== "ready") {
      return res.status(400).json({ error: "Can only roll back to a successful deployment" });
    }

    // Find the project's current production deployment and mark others
    const projectDeployments = listDeployments(deployment.project_id);

    // Rollback: update all deployments to non-production, mark selected as production
    for (const d of projectDeployments) {
      updateDeployment(d.id, { status: d.id === deployment.id ? "ready" : d.status });
    }

    const updated = getDeploymentById(deployment.id);
    res.json({
      success: true,
      message: `Rolled back to deployment version ${updated.version}`,
      deployment: updated,
    });
  } catch (err) {
    res.status(500).json({ error: "Rollback failed", message: err.message });
  }
});

app.get("/api/projects/:projectId/deployments", (req, res) => {
  try {
    const { projectId } = req.params;
    const deployments = listDeployments(projectId);
    res.json({ deployments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/deployments/:deploymentId/logs", (req, res) => {
  try {
    const deployment = getDeploymentById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ error: "Deployment not found" });
    }

    const logPath = path.join(LOG_DIR, `deploy-${deployment.id}.log`);
    let logs = "";

    if (fs.existsSync(logPath)) {
      logs = fs.readFileSync(logPath, "utf8");
    } else {
      // Generate synthetic logs from deployment record
      logs = `Deployment ${deployment.id}\n`;
      logs += `Project: ${deployment.project_id}\n`;
      logs += `Version: ${deployment.version}\n`;
      logs += `Status: ${deployment.status}\n`;
      logs += `Created: ${new Date(deployment.created_at).toISOString()}\n`;
      if (deployment.build_started_at) {
        logs += `Build started: ${new Date(deployment.build_started_at).toISOString()}\n`;
      }
      if (deployment.build_completed_at) {
        logs += `Build completed: ${new Date(deployment.build_completed_at).toISOString()}\n`;
      }
      if (deployment.build_duration_ms) {
        logs += `Build duration: ${deployment.build_duration_ms}ms\n`;
      }
      if (deployment.error_message) {
        logs += `\nError: ${deployment.error_message}\n`;
      }
      if (deployment.status === "ready") {
        logs += "\nBuild completed successfully.\n";
        logs += `Files deployed: ${deployment.file_count || 0}\n`;
        logs += `Total size: ${deployment.total_size || 0} bytes\n`;
      }
    }

    res.json({ deploymentId: deployment.id, logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to get logs", message: err.message });
  }
});

// ---- Environment Variables ----
app.get("/api/projects/:projectId/env", (req, res) => {
  try {
    const { environment } = req.query;
    const vars = listEnvVars(req.params.projectId, environment);
    // Never return secret values
    const sanitized = vars.map((v) => ({
      id: v.id,
      key: v.key,
      type: v.type,
      environment: v.environment,
      value: v.type === "secret" ? "[REDACTED]" : v.value,
      created_at: v.created_at,
      updated_at: v.updated_at,
    }));
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: "Failed to list environment variables", message: err.message });
  }
});

app.post("/api/projects/:projectId/env", (req, res) => {
  try {
    const { key, value, type = "config", environment = "production" } = req.body;

    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "Environment variable key is required" });
    }

    if (!value || typeof value !== "string") {
      return res.status(400).json({ error: "Environment variable value is required" });
    }

    const variable = setEnvVar(req.params.projectId, key, value, type, environment);
    res.status(201).json({
      id: variable.id,
      key: variable.key,
      type: variable.type,
      environment: variable.environment,
      value: variable.type === "secret" ? "[REDACTED]" : variable.value,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to set environment variable", message: err.message });
  }
});

app.delete("/api/projects/:projectId/env/:varId", (req, res) => {
  try {
    deleteEnvVar(req.params.varId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete environment variable", message: err.message });
  }
});

// ---- Domains ----
app.get("/api/projects/:projectId/domains", (req, res) => {
  try {
    const domains = listDomains(req.params.projectId);
    res.json(domains);
  } catch (err) {
    res.status(500).json({ error: "Failed to list domains", message: err.message });
  }
});

app.post("/api/projects/:projectId/domains", (req, res) => {
  try {
    const { name, environment = "production" } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Domain name is required" });
    }

    const domain = addDomain(req.params.projectId, name.trim(), environment);
    res.status(201).json(domain);
  } catch (err) {
    res.status(500).json({ error: "Failed to add domain", message: err.message });
  }
});

app.post("/api/domains/:id/verify", (req, res) => {
  try {
    const domain = verifyDomain(req.params.id);
    res.json({ success: true, domain });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify domain", message: err.message });
  }
});

app.delete("/api/domains/:id", (req, res) => {
  try {
    deleteDomain(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete domain", message: err.message });
  }
});

// ---- GitHub Commits ----
app.post("/api/projects/:projectId/github/connect", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { repoUrl, token, branch = "main" } = req.body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "Repository URL is required" });
    }

    const project = getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    setProjectGitHub(projectId, repoUrl, token, branch);
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ error: "Failed to connect GitHub", message: err.message });
  }
});

app.post("/api/projects/:projectId/github/sync", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = getProjectById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const repoDir = path.join(WORKSPACE_DIR, projectId, "repo");
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      return res.status(400).json({ error: "No cloned repository found for this project. Re-import the Git repository." });
    }
    const repoUrl = project.github_repo_url || "";
    if (repoUrl) {
      try { runGit(["fetch", "--all", "--prune"], repoDir); } catch {}
    }
    const { commits, count } = syncProjectCommitsFromRepo(projectId, repoDir, repoUrl);
    const ts = now();
    run("UPDATE projects SET github_last_synced_at = ?, updated_at = ? WHERE id = ?", [ts, ts, projectId]);
    res.json({ success: true, commits, count, commitCount: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync commits", message: err.message });
  }
});

app.get("/api/projects/:projectId/github/commits", (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit } = req.query;
    const commits = limit ? listCommits(projectId, parseInt(limit, 10)) : listCommits(projectId, 100000);
    res.json({ commits, count: commits.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to list commits", message: err.message });
  }
});

app.get("/api/commits", (req, res) => {
  try {
    const { limit } = req.query;
    const commits = limit ? listAllCommits(parseInt(limit, 10)) : listAllCommits();
    res.json({ commits, count: commits.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to list all commits", message: err.message });
  }
});

app.get("/api/github/repos", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
    if (!token) {
      return res.status(401).json({ error: "GitHub token required" });
    }
    const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "VG-Deploy-Platform",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const repos = await response.json();
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch repos", message: err.message });
  }
});

app.get("/api/github/branches", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
    const { owner, repo } = req.query;
    if (!token || !owner || !repo) {
      return res.status(400).json({ error: "Token, owner, repo required" });
    }
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "VG-Deploy-Platform",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const branches = await response.json();
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch branches", message: err.message });
  }
});

app.get("/api/commits", (req, res) => {
  try {
    const { limit } = req.query;
    const commits = limit ? listAllCommits(parseInt(limit, 10)) : listAllCommits();
    res.json({ commits });
  } catch (err) {
    res.status(500).json({ error: "Failed to list all commits", message: err.message });
  }
});

app.delete("/api/projects/:projectId/github/disconnect", (req, res) => {
  try {
    const { projectId } = req.params;
    deleteCommits(projectId);
    setProjectGitHub(projectId, "", "", "main");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to disconnect", message: err.message });
  }
});

// ---------- Static file serving for deployments ----------
const DEPLOYMENT_INDEX_CANDIDATES = [
  "index.html",
  "dist/index.html",
  "build/index.html",
  "public/index.html",
  "out/index.html",
  "src/index.html",
];
const deploymentMaterializeInFlight = new Map();

function rewriteDeploymentHtml(html, prefix) {
  // Built bundles (Vite/CRA/etc.) reference root-absolute assets like "/assets/x.js".
  // Under a path-hosted deployment those must resolve beneath the deployment prefix.
  const assetPrefixes = "assets|static|favicon|logo|images|img|fonts|manifest|robots|apple-touch|vite\\.svg|webmanifest|_next";
  const re = new RegExp(`(href|src)=(["'])\\/(${assetPrefixes})`, "gi");
  return String(html).replace(re, `$1=$2${prefix}/$3`);
}

function findDeploymentRoot(dir) {
  if (!dir) return null;
  const isFile = (p) => {
    try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; }
  };
  // Fast path: well-known output dirs at the archive root.
  for (const marker of DEPLOYMENT_INDEX_CANDIDATES) {
    const full = path.join(dir, marker);
    if (isFile(full)) return path.dirname(full);
  }
  // Recursive search: many repos keep the built site under e.g. `client/dist`,
  // `apps/web/out`, etc. Prefer built-output folders over source `index.html`.
  const found = [];
  const walk = (d, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && entry.name === "index.html") found.push(full);
    }
  };
  walk(dir, 0);
  if (!found.length) return null;
  const score = (p) => {
    const low = p.replace(/\\/g, "/").toLowerCase();
    if (/\/dist\/index\.html$/.test(low)) return 0;
    if (/\/build\/index\.html$/.test(low)) return 1;
    if (/\/out\/index\.html$/.test(low)) return 2;
    if (/\/public\/index\.html$/.test(low)) return 3;
    if (/\/client\/index\.html$/.test(low)) return 6;
    return 4;
  };
  found.sort((a, b) => score(a) - score(b) || a.length - b.length);
  return path.dirname(found[0]);
}

async function resolveAirtableDeploymentContext(deploymentId) {
  try {
    const cfg = getAirtableConfig();
    if (!cfg.pat) return null;
    const deps = await airtableFetchAllRecords(cfg, cfg.deploymentsTableId);
    const rec = (deps || []).find((r) => String(af(r.fields || {}, "DeploymentId", "Deployment ID", "Id", "ID") || "").trim() === deploymentId);
    if (!rec) return null;
    const projectName = String(af(rec.fields || {}, "ProjectName", "Project Name", "Project") || "").trim();
    let repoUrl = "";
    if (projectName) {
      try {
        const projects = await airtableFetchAllRecords(cfg, cfg.projectsTableId);
        const pr = projects.find((r) => String(af(r.fields || {}, "Name", "ProjectName", "Project Name") || "").trim() === projectName);
        if (pr) repoUrl = af(pr.fields || {}, "URL", "Repository URL", "RepositoryUrl", "Repo URL", "RepoURL");
      } catch {}
    }
    return { sha: deploymentId.startsWith("dpl_") ? deploymentId.slice(4) : "", projectName, repoUrl };
  } catch (e) {
    console.warn("[vg-deploy] airtable deployment context failed:", e.message);
    return null;
  }
}

async function ensureDeploymentArtifact(deploymentId, sha, repoUrl, preferredRoot) {
  const candidates = [];
  if (preferredRoot) candidates.push(preferredRoot);
  candidates.push(path.join(ARTIFACT_DIR, deploymentId));
  for (const dir of candidates) {
    const root = findDeploymentRoot(dir);
    if (root) return root;
  }
  const parsed = parseGitHubRepoUrl(repoUrl);
  if (!sha || !parsed) return null;
  if (deploymentMaterializeInFlight.has(deploymentId)) return deploymentMaterializeInFlight.get(deploymentId);

  const task = (async () => {
    const dir = path.join(ARTIFACT_DIR, deploymentId);
    ensureWritableDir(dir);
    const zip = path.join(LOG_DIR, `rebuild-${deploymentId}.zip`);
    try { fs.rmSync(zip, { force: true }); } catch {}
    const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
    await downloadGitHubZipball(parsed.owner, parsed.repo, sha, token, zip);
    extractZipStrippingRoot(zip, dir);
    try { fs.rmSync(zip, { force: true }); } catch {}
    return findDeploymentRoot(dir);
  })();
  deploymentMaterializeInFlight.set(deploymentId, task);
  try {
    return await task;
  } finally {
    deploymentMaterializeInFlight.delete(deploymentId);
  }
}

app.use("/deployments", async (req, res, next) => {
  try {
    const deploymentId = decodeURIComponent((req.path.split("/")[1] || "").split("?")[0]);
    if (!deploymentId) return next();

    let sha = "";
    let repoUrl = req.query.repoUrl ? String(req.query.repoUrl) : "";
    let preferredRoot = "";

    const local = getDeploymentById(deploymentId);
    if (local) {
      sha = local.commit_sha || "";
      preferredRoot = local.artifact_path || "";
      if (!repoUrl) {
        const proj = getProjectById(local.project_id);
        repoUrl = (proj && proj.github_repo_url) || "";
      }
    } else if (deploymentId.startsWith("dpl_")) {
      sha = deploymentId.slice(4);
      if (!repoUrl) {
        const ctx = await resolveAirtableDeploymentContext(deploymentId);
        if (ctx) repoUrl = ctx.repoUrl || "";
      }
    } else {
      // Clean alias form: <project-slug>-<shortsha>
      const aliasMatch = String(deploymentId).match(/-([0-9a-f]{7,40})$/i);
      if (!aliasMatch) return res.status(404).json({ error: "Deployment not found" });
      sha = aliasMatch[1];
      if (!repoUrl) {
        try {
          const ctx = await resolveAirtableDeploymentContext(deploymentId);
          if (ctx && ctx.repoUrl) repoUrl = ctx.repoUrl;
        } catch {}
      }
    }

    const root = await ensureDeploymentArtifact(deploymentId, sha, repoUrl, preferredRoot);
    if (!root) {
      return res.status(404).json({
        error: "Deployment artifact unavailable",
        message: "Provide ?repoUrl=<github url> or configure GITHUB_TOKEN so the commit can be fetched.",
      });
    }

    let rel = req.path.slice(1 + deploymentId.length) || "/";
    try { rel = decodeURIComponent(rel.split("?")[0]); } catch {}
    if (rel.includes("\0")) return res.status(400).json({ error: "Invalid path" });
    const cleaned = "/" + path.normalize(rel).replace(/^([/\\])+/, "");
    const resolvedRoot = path.resolve(root);
    let filePath = path.resolve(path.join(root, cleaned));
    if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
      return res.status(403).json({ error: "Access denied" });
    }
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
    } catch {}

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".map": "application/json; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
        ".eot": "application/vnd.ms-fontobject",
        ".wasm": "application/wasm",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      if (ext === ".html") {
        try {
          const html = fs.readFileSync(filePath, "utf8");
          return res.send(rewriteDeploymentHtml(html, `/deployments/${encodeURIComponent(deploymentId)}`));
        } catch {}
      }
      return res.sendFile(filePath);
    }

    // SPA fallback: serve index.html for extensionless routes.
    if (!path.extname(rel) || rel === "/" || rel === "") {
      const idx = path.join(root, "index.html");
      if (fs.existsSync(idx)) {
        try {
          const html = fs.readFileSync(idx, "utf8");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(rewriteDeploymentHtml(html, `/deployments/${encodeURIComponent(deploymentId)}`));
        } catch {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.sendFile(idx);
        }
      }
    }
    return res.status(404).json({ error: "File not found" });
  } catch (e) {
    console.warn("[vg-deploy] deployment serve failed:", e.message);
    return res.status(502).json({ error: "Failed to serve deployment", message: e.message });
  }
});

// ---------- Git import helpers ----------
function runGit(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `git ${args.join(" ")} failed`).trim());
  return (r.stdout || "").trim();
}

function parseGitLog(repoDir, limit) {
  const args = ["log", "--pretty=format:%H%x09%s%x09%an%x09%ae%x09%aI"];
  if (limit) args.push("-n", String(limit));
  const out = runGit(args, repoDir);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, message = "", authorName = "", authorEmail = "", authorDate = ""] = line.split("\t");
    return { sha, message, authorName, authorEmail, authorDate };
  });
}

function syncProjectCommitsFromRepo(projectId, repoDir, repoUrl) {
  const commits = parseGitLog(repoDir);
  let count = 0;
  for (const c of commits) {
    if (!c.sha) continue;
    upsertCommit(
      projectId,
      c.sha,
      c.message,
      c.authorName,
      c.authorEmail,
      c.authorDate,
      "",
      `${String(repoUrl || "").replace(/\.git$/i, "")}/commit/${c.sha}`
    );
    count++;
  }
  return { commits, count };
}

app.post("/api/projects/:projectId/github/sync", async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = getProjectById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const repoDir = path.join(WORKSPACE_DIR, projectId, "repo");
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      return res.status(400).json({ error: "No cloned repository found for this project. Re-import the Git repository." });
    }
    const repoUrl = project.github_repo_url || "";
    if (repoUrl) {
      try { runGit(["fetch", "--all", "--prune"], repoDir); } catch {}
    }
    const { commits, count } = syncProjectCommitsFromRepo(projectId, repoDir, repoUrl);
    const ts = now();
    run("UPDATE projects SET github_last_synced_at = ?, updated_at = ? WHERE id = ?", [ts, ts, projectId]);
    res.json({ success: true, commits, count, commitCount: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync commits", message: err.message });
  }
});

app.post("/api/projects/sync-commits", async (req, res) => {
  const requestId = `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { projectName, repoUrl, githubToken } = req.body || {};
    if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
      return res.status(400).json({ error: "Project name is required", requestId });
    }
    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "Repository URL is required", requestId });
    }
    const parsedRepo = parseGitHubRepoUrl(repoUrl);
    if (!parsedRepo) {
      return res.status(400).json({ error: "Invalid repository URL. Use a valid GitHub HTTPS URL (https://github.com/owner/repo).", requestId });
    }
    const authToken = (typeof githubToken === "string" ? githubToken : "").trim() || (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
    let repoMeta = null;
    try {
      repoMeta = await verifyGitHubRepoAccess(parsedRepo.owner, parsedRepo.repo, authToken);
    } catch (e) {
      const status = e.status || 500;
      if (status === 401) return res.status(401).json({ error: "Missing or invalid GitHub authentication for this repository", requestId });
      if (status === 403) return res.status(403).json({ error: "No permission to access this repository (or GitHub API rate limit reached). Provide a valid GitHub token.", requestId });
      if (status === 404) return res.status(404).json({ error: "Repository not found or inaccessible", requestId });
      return res.status(502).json({ error: "Failed to verify repository access with GitHub", requestId });
    }
    const defaultBranch = (repoMeta && repoMeta.default_branch) ? String(repoMeta.default_branch) : "main";
    const commits = await fetchCommitsFromGitHub(parsedRepo.owner, parsedRepo.repo, authToken, defaultBranch);
    let airtableSync = null;
    try {
      airtableSync = await syncCommitsToAirtable(commits, projectName.trim());
    } catch (e) {
      airtableSync = { ok: false, error: e.message };
    }
    // Best-effort: update local DB if a matching project exists
    try {
      const local = getProjectByName(projectName.trim());
      if (local) {
        setProjectGitHub(local.id, (repoMeta && repoMeta.clone_url) ? String(repoMeta.clone_url) : String(repoUrl).trim(), "", defaultBranch);
        for (const c of commits) {
          upsertCommit(local.id, c.sha, c.message, c.authorName, c.authorEmail, c.authorDate, c.url, c.htmlUrl);
        }
      }
    } catch {}
    res.json({
      ok: true,
      requestId,
      projectName: projectName.trim(),
      repoUrl: (repoMeta && repoMeta.clone_url) ? String(repoMeta.clone_url) : String(repoUrl).trim(),
      branch: defaultBranch,
      commitCount: commits.length,
      commits,
      airtable: airtableSync,
    });
  } catch (err) {
    console.error(`[sync-commits] unexpected:`, err && err.message ? err.message : err);
    res.status(500).json({ error: "Failed to sync commits", requestId, message: err && err.message ? err.message : "Unexpected error" });
  }
});

app.post("/api/projects/import-git", async (req, res) => {
  const requestId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { repoUrl, projectName, githubToken } = req.body || {};

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "Repository URL is required", requestId });
    }
    if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
      return res.status(400).json({ error: "Project name is required", requestId });
    }

    const trimmed = projectName.trim();
    if (trimmed.length > 100) {
      return res.status(400).json({ error: "Project name must be 100 characters or fewer", requestId });
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) {
      return res.status(400).json({ error: "Project name contains invalid characters", requestId });
    }
    if (getProjectByName(trimmed)) {
      return res.status(409).json({ error: "Project with this name already exists", requestId });
    }

    const parsedRepo = parseGitHubRepoUrl(repoUrl);
    if (!parsedRepo) {
      return res.status(400).json({ error: "Invalid repository URL. Use a valid GitHub HTTPS URL (https://github.com/owner/repo).", requestId });
    }

    const authToken = (typeof githubToken === "string" ? githubToken : "").trim() || (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
    let repoMeta = null;
    try {
      repoMeta = await verifyGitHubRepoAccess(parsedRepo.owner, parsedRepo.repo, authToken);
    } catch (e) {
      const status = e.status || 500;
      if (status === 401) return res.status(401).json({ error: "Missing or invalid GitHub authentication for this repository", requestId });
      if (status === 403) return res.status(403).json({ error: "No permission to access this repository (or GitHub API rate limit reached). Provide a valid GitHub token for private repos.", requestId });
      if (status === 404) return res.status(404).json({ error: "Repository not found or inaccessible", requestId });
      console.error(`[${requestId}] GitHub repo access check failed:`, e.message);
      return res.status(502).json({ error: "Failed to verify repository access with GitHub", requestId });
    }

    const defaultBranch = (repoMeta && repoMeta.default_branch) ? String(repoMeta.default_branch) : "main";
    const canonicalRepoUrl = (repoMeta && repoMeta.clone_url) ? String(repoMeta.clone_url) : String(repoUrl).trim();

    const project = createProject(trimmed, `Imported from ${parsedRepo.owner}/${parsedRepo.repo}`, "static");
    const projectWorkspace = path.join(WORKSPACE_DIR, project.id);
    try { fs.mkdirSync(projectWorkspace, { recursive: true }); } catch (e) { console.warn(`[${requestId}] mkdir workspace failed:`, e.message); }

    let responded = false;
    const sendJson = (status, body) => {
      if (responded) return;
      responded = true;
      res.status(status).json({ ...body, requestId });
    };

    const finalizeWithGitHubImport = async (reason) => {
      try {
        const commits = await importCommitsViaGitHubApi(project.id, canonicalRepoUrl, authToken, defaultBranch);
        setProjectGitHub(project.id, canonicalRepoUrl, "", defaultBranch);
        let airtableSync = { project: null, commits: null };
        try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, canonicalRepoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
        try { airtableSync.commits = await syncCommitsToAirtable(commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
        sendJson(201, {
          project: getProjectById(project.id) || project,
          message: `Repository imported via GitHub API (${reason}).`,
          path: null,
          commits,
          count: commits.length,
          commitCount: commits.length,
          warning: `Git clone ${reason} in this runtime. Commits loaded via GitHub API; deploy-from-commit requires a local cloned repo with git.`,
          airtable: airtableSync,
        });
        return true;
      } catch (apiErr) {
        console.error(`[${requestId}] GitHub import failed:`, apiErr.message);
        return false;
      }
    };

    // On Vercel/serverless, git is often unavailable and FS is ephemeral - prefer GitHub API import
    if (IS_VERCEL || !parseGitHubRepoUrl(canonicalRepoUrl)) {
      const ok = await finalizeWithGitHubImport(IS_VERCEL ? "serverless runtime" : "git unavailable");
      if (ok) return;
      try { deleteProject(project.id); } catch {}
      return res.status(502).json({ error: "Failed to import repository commits from GitHub", requestId });
    }

    const repoDir = path.join(projectWorkspace, "repo");
    let gitClone;
    try {
      gitClone = spawn("git", ["clone", "--no-tags", "--branch", defaultBranch, canonicalRepoUrl, repoDir], { cwd: projectWorkspace });
    } catch (spawnErr) {
      const ok = await finalizeWithGitHubImport("git unavailable");
      if (ok) return;
      try { deleteProject(project.id); } catch {}
      return res.status(500).json({ error: "Failed to clone repository", requestId });
    }

    let cloneErr = "";
    gitClone.stderr && gitClone.stderr.on("data", (d) => { cloneErr += d.toString(); });

    gitClone.on("close", async (code) => {
      if (code !== 0) {
        const ok = await finalizeWithGitHubImport("clone failed");
        if (ok) return;
        try { deleteProject(project.id); } catch {}
        console.error(`[${requestId}] Git clone failed:`, cloneErr.slice(-500));
        return sendJson(502, { error: "Failed to clone repository. Check repository access and URL.", details: undefined });
      }
      try {
        const { commits, count } = syncProjectCommitsFromRepo(project.id, repoDir, canonicalRepoUrl);
        setProjectGitHub(project.id, canonicalRepoUrl, "", defaultBranch);
        let airtableSync = { project: null, commits: null };
        try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, canonicalRepoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
        try { airtableSync.commits = await syncCommitsToAirtable(commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
        sendJson(201, {
          project: getProjectById(project.id) || project,
          message: "Repository imported successfully",
          path: repoDir,
          commits,
          count,
          commitCount: count,
          airtable: airtableSync,
        });
      } catch (gitErr) {
        console.error(`[${requestId}] Post-clone commit sync failed:`, gitErr.message);
        const ok = await finalizeWithGitHubImport("local commit sync failed");
        if (ok) return;
        try { deleteProject(project.id); } catch {}
        sendJson(500, { error: "Repository imported but commits could not be loaded", requestId });
      }
    });

    gitClone.on("error", async (err) => {
      const ok = await finalizeWithGitHubImport(`git unavailable (${err.message})`);
      if (ok) return;
      try { deleteProject(project.id); } catch {}
      sendJson(502, { error: "Failed to clone repository", requestId });
    });
  } catch (err) {
    console.error("Import-git unexpected error:", err && err.message ? err.message : err);
    res.status(500).json({ error: "Failed to import repository", requestId, message: "Unexpected server error" });
  }
});
// ---------- Airtable dashboard APIs (read-only) ----------
app.get("/api/integrations/airtable/config", (req, res) => {
  try {
    res.json(getPublicAirtableConfig());
  } catch (err) {
    res.status(500).json({ error: "Failed to get Airtable config", message: err.message });
  }
});

app.post("/api/integrations/airtable/config", (req, res) => {
  try {
    const body = req.body || {};
    const saved = setAirtableConfig(body);
    res.json({ ok: true, config: saved });
  } catch (err) {
    res.status(500).json({ error: "Failed to save Airtable config", message: err.message });
  }
});

app.get("/api/airtable/dashboard/overview", async (req, res) => {
  try {
    const cfg = getAirtableConfig();
    const records = await airtableFetchAllRecords(cfg, cfg.deploymentsTableId);
    const rows = records.map((r) => ({ id: r.id, fields: r.fields || {} }));
    const deploymentIds = rows.map((r) => af(r.fields, "DeploymentId", "Deployment ID", "Id", "ID")).filter((v) => String(v).trim() !== "");
    const projectNames = rows.map((r) => af(r.fields, "ProjectName", "Project Name", "Project")).filter((v) => String(v).trim() !== "");
    const statuses = rows.map((r) => normalizeAirtableStatus(af(r.fields, "Status", "status")));
    const totalDeployments = deploymentIds.length || rows.length;
    const totalProjects = new Set(projectNames.map((v) => String(v).trim())).size;
    const ready = statuses.filter((s) => s === "ready").length;
    const failed = statuses.filter((s) => s === "error" || s === "failed").length;
    res.json({
      ok: true,
      source: "airtable",
      metrics: { totalDeployments, totalProjects, ready, failed },
      count: rows.length,
    });
  } catch (err) {
    res.status(err.message && err.message.includes("not configured") ? 400 : 500).json({ ok: false, error: err.message, source: "airtable" });
  }
});

app.get("/api/airtable/projects", async (req, res) => {
  try {
    const cfg = getAirtableConfig();
    const records = await airtableFetchAllRecords(cfg, cfg.projectsTableId);
    const projects = records.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        name: af(f, "Name", "ProjectName", "Project Name"),
        repositoryUrl: af(f, "URL", "Repository URL", "RepositoryUrl", "Repo URL", "RepoURL"),
        createdAt: af(f, "CreatedAt", "Created At", "Created"),
        framework: af(f, "Framework", "framework"),
      };
    });
    res.json({ ok: true, source: "airtable", projects, count: projects.length });
  } catch (err) {
    res.status(err.message && err.message.includes("not configured") ? 400 : 500).json({ ok: false, error: err.message, source: "airtable", projects: [] });
  }
});

app.get("/api/airtable/commits", async (req, res) => {
  try {
    const cfg = getAirtableConfig();
    const records = await airtableFetchAllRecords(cfg, cfg.commitsTableId);
    const commits = records.map((r) => {
      const f = r.fields || {};
      return {
        id: r.id,
        commitHash: af(f, "CommitHash", "Commit Hash", "Commit", "SHA"),
        message: af(f, "CommitMessage", "Commit Message", "Message"),
        author: af(f, "Author", "author"),
        projectName: af(f, "ProjectName", "Project Name", "Project"),
        timestamp: af(f, "Timestamp", "Date", "CreatedAt", "Created At"),
      };
    });
    res.json({ ok: true, source: "airtable", commits, count: commits.length });
  } catch (err) {
    res.status(err.message && err.message.includes("not configured") ? 400 : 500).json({ ok: false, error: err.message, source: "airtable", commits: [] });
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API endpoint not found" });
  } else {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

module.exports = app;

// ---------- Start server after database initialization ----------
if (require.main === module) {
  initPromise.then(() => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`VG Deployment App running at http://${HOST}:${PORT}/`);
      console.log(`Bound to ${HOST}:${PORT} (local-only)`);
    });

    process.on("SIGTERM", () => server.close(() => process.exit(0)));
    process.on("SIGINT", () => server.close(() => process.exit(0)));
  }).catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
} else {
  // Serverless/runtime import (e.g. Vercel): don't exit; UI may still render, APIs depend on writable runtime.
  initPromise.catch((err) => {
    console.error("Database init failed (continuing in serverless mode):", err && err.message ? err.message : err);
  });
}
