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

  while (hasMore) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "VG-Deploy-Platform",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const c of data) {
      commits.push({
        sha: c.sha,
        message: c.commit.message,
        authorName: c.commit.author?.name || "Unknown",
        authorEmail: c.commit.author?.email || "",
        authorDate: c.commit.author?.date || "",
        url: c.url,
        htmlUrl: c.html_url,
      });
    }

    if (data.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
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
  const records = (commits || []).filter(c => c && c.sha).map((c) => {
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
  if (!records.length) return { ok: true, count: 0 };
  const recs = await airtableCreateRecords(cfg, cfg.commitsTableId, records);
  return { ok: true, count: recs.length };
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
  const MAX_FILES = 10000;
  const MAX_TOTAL_SIZE = 1024 * 1024 * 1024; // 1 GB

  const fd = fs.openSync(zipPath, "r");
  const stat = fs.fstatSync(fd);
  const buffer = Buffer.alloc(stat.size);
  fs.readSync(fd, buffer, 0, stat.size, 0);
  fs.closeSync(fd);

  const entries = parseZipBuffer(buffer);
  const extracted = [];
  let totalSize = 0;
  let fileCount = 0;

  if (entries.length > MAX_FILES) {
    throw new Error(`Too many files in archive: ${entries.length} (max ${MAX_FILES})`);
  }

  for (const entry of entries) {
    if (!isSafeZipEntry(entry.name)) {
      throw new Error(`Unsafe ZIP entry detected: ${entry.name}`);
    }

    if (entry.name.endsWith("/") || entry.name.endsWith("\\")) {
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

app.get("/api/projects/:projectId/commits/:sha/deployment", (req, res) => {
  try {
    const { projectId, sha } = req.params;
    const project = getProjectById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const deployment = getDeploymentByCommit(projectId, sha);
    const commit = get("SELECT * FROM repository_commits WHERE project_id = ? AND sha = ? LIMIT 1", [projectId, sha]);
    res.json({ deployment, commit, project });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve commit deployment", message: err.message });
  }
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

app.post("/api/projects/:projectId/deploy-commit", (req, res) => {
  try {
    const { projectId } = req.params;
    const { sha, branch } = req.body || {};
    if (!sha || typeof sha !== "string") return res.status(400).json({ error: "Commit SHA is required" });
    const project = getProjectById(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const repoDir = path.join(WORKSPACE_DIR, projectId, "repo");
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      return res.status(400).json({ error: "No cloned repository found for this project. Re-import the Git repository." });
    }

    const existing = getDeploymentByCommit(projectId, sha);
    if (existing) return res.json({ deployment: existing, reused: true });

    const version = getNextVersion(projectId);
    const deployment = createDeployment(projectId, version, "building", { commitSha: sha, branch: branch || project.github_branch || "main", environment: "production" });
    const deployArtifactDir = path.join(ARTIFACT_DIR, deployment.id);
    fs.mkdirSync(deployArtifactDir, { recursive: true });
    updateDeployment(deployment.id, { status: "building", build_started_at: now() });

    try {
      const tmpZip = path.join(LOG_DIR, `tmp-deploy-${deployment.id}.zip`);
      try { fs.rmSync(tmpZip, { force: true }); } catch {}
      const archive = spawnSync("git", ["-C", repoDir, "archive", "--format=zip", "-o", tmpZip, sha], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
      if (archive.status !== 0 || !fs.existsSync(tmpZip)) throw new Error((archive.stderr || archive.stdout || "git archive failed").trim());
      safeExtractZip(tmpZip, deployArtifactDir);
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
      res.status(201).json({ deployment: updated, reused: false, url: `http://${HOST}:${PORT}/deployments/${updated.id}/` });
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
app.use("/deployments", (req, res, next) => {
  const deploymentId = req.path.split("/")[1];
  if (!deploymentId) return next();

  const deployment = getDeploymentById(deploymentId);
  if (!deployment || deployment.status !== "ready") {
    return res.status(404).json({ error: "Deployment not found or not ready" });
  }

  // Serve the file from the artifact directory
  const relativePath = req.path.slice(`/deployments/${deploymentId}`.length) || "/";
  const filePath = path.join(deployment.artifact_path || path.join(ARTIFACT_DIR, deploymentId), relativePath);

  // Security: prevent path traversal
  const resolvedArtifactDir = path.resolve(deployment.artifact_path || path.join(ARTIFACT_DIR, deploymentId));
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedArtifactDir + path.sep) && resolvedFilePath !== resolvedArtifactDir) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".txt": "text/plain",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
    res.sendFile(filePath);
  } else if (relativePath === "/" || relativePath === "") {
    const indexPath = path.join(deployment.artifact_path || path.join(ARTIFACT_DIR, deploymentId), "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Content-Type", "text/html");
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "No index.html found" });
    }
  } else {
    res.status(404).json({ error: "File not found" });
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

app.post("/api/projects/import-git", async (req, res) => {
  try {
    const { repoUrl, projectName } = req.body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return res.status(400).json({ error: "Repository URL is required" });
    }
    if (!projectName || typeof projectName !== "string") {
      return res.status(400).json({ error: "Project name is required" });
    }

    const trimmed = projectName.trim();
    if (getProjectByName(trimmed)) {
      return res.status(409).json({ error: "Project with this name already exists" });
    }

    const project = createProject(trimmed, `Imported from ${repoUrl}`, "static");
    const projectWorkspace = path.join(WORKSPACE_DIR, project.id);
    fs.mkdirSync(projectWorkspace, { recursive: true });

    const repoDir = path.join(projectWorkspace, "repo");
    let gitClone;
    try {
      gitClone = spawn("git", ["clone", "--no-tags", String(repoUrl), repoDir], { cwd: projectWorkspace });
    } catch (spawnErr) {
      // Synchronous spawn failure (rare) - try GitHub API fallback
      if (parseGitHubRepoUrl(repoUrl)) {
        try {
          const result = await importCommitsViaGitHubApi(project.id, repoUrl, "", "main");
          setProjectGitHub(project.id, repoUrl, "", "main");
          let airtableSync = { project: null, commits: null };
          try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, repoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
          try { airtableSync.commits = await syncCommitsToAirtable(result.commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
          return res.status(201).json({
            project: getProjectById(project.id) || project,
            message: "Repository imported via GitHub API (git unavailable).",
            path: null,
            commits: result.commits,
            count: result.count,
            commitCount: result.commitCount,
            warning: "Git clone unavailable in this runtime. Commits loaded via GitHub API; deploy-from-commit requires a local cloned repo.",
            airtable: airtableSync,
          });
        } catch (apiErr) {
          try { deleteProject(project.id); } catch {}
          return res.status(500).json({ error: "Failed to clone repository", message: apiErr.message || spawnErr.message });
        }
      }
      try { deleteProject(project.id); } catch {}
      return res.status(500).json({ error: "Failed to clone repository", message: spawnErr.message });
    }

    let cloneErr = "";
    gitClone.stderr && gitClone.stderr.on("data", (d) => { cloneErr += d.toString(); });

    gitClone.on("close", async (code) => {
      if (code !== 0) {
        // Fallback: GitHub API import when git clone fails (e.g. no git on Vercel, auth/network issues for public repos)
        if (parseGitHubRepoUrl(repoUrl)) {
          try {
            const result = await importCommitsViaGitHubApi(project.id, repoUrl, "", "main");
            setProjectGitHub(project.id, repoUrl, "", "main");
            let airtableSync = { project: null, commits: null };
            try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, repoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
            try { airtableSync.commits = await syncCommitsToAirtable(result.commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
            return res.status(201).json({
              project: getProjectById(project.id) || project,
              message: "Repository imported via GitHub API (git clone unavailable/failed).",
              path: null,
              commits: result.commits,
              count: result.count,
              commitCount: result.commitCount,
              warning: "Git clone failed in this runtime; commits loaded via GitHub API. Deploy-from-commit requires a local cloned repo. " + (cloneErr ? `Clone error: ${cloneErr.slice(-500)}` : ""),
              airtable: airtableSync,
            });
          } catch (apiErr) {
            // fall through to clone error response
          }
        }
        try { deleteProject(project.id); } catch {}
        return res.status(500).json({
          error: "Failed to clone repository",
          message: "Git clone failed. Check the URL and permissions.",
          details: cloneErr.slice(-4000),
        });
      }

      try {
        const { commits, count } = syncProjectCommitsFromRepo(project.id, repoDir, repoUrl);
        setProjectGitHub(project.id, repoUrl, "", "main");
        let airtableSync = { project: null, commits: null };
        try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, repoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
        try { airtableSync.commits = await syncCommitsToAirtable(commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
        return res.status(201).json({
          project: getProjectById(project.id) || project,
          message: "Repository imported successfully",
          path: repoDir,
          commits,
          count,
          commitCount: count,
          airtable: airtableSync,
        });
      } catch (gitErr) {
        console.error("Failed to fetch/store git commits:", gitErr.message);
        try { setProjectGitHub(project.id, repoUrl, "", "main"); } catch {}
        let airtableSync = { project: null, commits: null };
        try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, repoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
        return res.status(201).json({
          project: getProjectById(project.id) || project,
          message: "Repository imported, but commits could not be loaded automatically.",
          path: repoDir,
          commits: [],
          count: 0,
          commitCount: 0,
          warning: gitErr.message,
          airtable: airtableSync,
        });
      }
    });

    gitClone.on("error", async (err) => {
      // Fallback for environments without git binary (common on Vercel serverless)
      if (parseGitHubRepoUrl(repoUrl)) {
        try {
          const result = await importCommitsViaGitHubApi(project.id, repoUrl, "", "main");
          setProjectGitHub(project.id, repoUrl, "", "main");
          let airtableSync = { project: null, commits: null };
          try { airtableSync.project = await syncProjectToAirtable(getProjectById(project.id) || project, repoUrl); } catch (e) { airtableSync.project = { ok: false, error: e.message }; }
          try { airtableSync.commits = await syncCommitsToAirtable(result.commits, trimmed); } catch (e) { airtableSync.commits = { ok: false, error: e.message }; }
          return res.status(201).json({
            project: getProjectById(project.id) || project,
            message: "Repository imported via GitHub API (git not installed).",
            path: null,
            commits: result.commits,
            count: result.count,
            commitCount: result.commitCount,
            warning: `Git is not available in this runtime (${err.message}). Commits loaded via GitHub API; deploy-from-commit requires a local cloned repo with git.`,
            airtable: airtableSync,
          });
        } catch (apiErr) {
          // fall through
        }
      }
      try { deleteProject(project.id); } catch {}
      return res.status(500).json({
        error: "Failed to clone repository",
        message: err.message || "Git clone failed",
      });
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to import repository", message: err.message });
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
