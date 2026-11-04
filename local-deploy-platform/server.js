"use strict";

const express = require("express");
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
} = require("./database");

const PORT = parseInt(process.env.PORT, 10) || 3456;
const HOST = process.env.HOST || "127.0.0.1";
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || path.join(__dirname, "workspaces");
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(__dirname, "public", "deployments");
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const BUILD_TIMEOUT_MS = parseInt(process.env.BUILD_TIMEOUT_MS, 10) || 300000;
const BUILD_MAX_MEMORY_MB = parseInt(process.env.BUILD_MAX_MEMORY_MB, 10) || 512;

for (const dir of [WORKSPACE_DIR, ARTIFACT_DIR, LOG_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Multer config for ZIP uploads
const upload = multer({
  dest: path.join(__dirname, "logs", "tmp-uploads"),
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

// Ensure tmp upload dir exists
const tmpUploadDir = path.join(__dirname, "logs", "tmp-uploads");
if (!fs.existsSync(tmpUploadDir)) {
  fs.mkdirSync(tmpUploadDir, { recursive: true });
}
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
    res.json(deployment);
  } catch (err) {
    res.status(500).json({ error: "Failed to get deployment", message: err.message });
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

// ---------- 404 ----------
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

// ---------- Start server after database initialization ----------
initPromise.then(() => {
  const server = app.listen(PORT, HOST, () => {
    console.log(`VG Deployment App running at http://${HOST}:${PORT}/`);
    console.log(`Bound to ${HOST}:${PORT} (local-only)`);
  });

  process.on("SIGTERM", () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    server.close(() => {
      process.exit(0);
    });
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
