"use strict";

const DEFAULTS = {
  baseId: "appKbcUHLOb0igCmB",
  projectsTable: "tbl2z6ShZzPC6dICR",
  deploymentsTable: "tblxLdckVeOeRfrVB",
  commitsTable: "tblpKj792XwLlytVi",
};

function cfgOf(db, overrides = {}) {
  const c = db.getIntegrationConfig("airtable") || {};
  return {
    pat: overrides.pat || c.pat || "",
    baseId: overrides.baseId || c.baseId || DEFAULTS.baseId,
    projectsTable: overrides.projectsTable || c.projectsTable || DEFAULTS.projectsTable,
    deploymentsTable: overrides.deploymentsTable || c.deploymentsTable || DEFAULTS.deploymentsTable,
    commitsTable: overrides.commitsTable || c.commitsTable || DEFAULTS.commitsTable,
  };
}

function requireConfig(cfg) {
  if (!cfg.pat) throw new Error("Airtable Personal Access Token is not configured");
  if (!cfg.baseId) throw new Error("Airtable Base ID is not configured");
}

async function airtableFetch(cfg, tableId, { method = "GET", query, body } = {}) {
  requireConfig(cfg);
  if (!tableId) throw new Error("Airtable table ID is not configured");
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const url = `https://api.airtable.com/v0/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(tableId)}${qs}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.pat}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: text || `HTTP ${res.status}` } }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Airtable API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function listAllRecords(cfg, tableId, params = {}) {
  const out = [];
  let offset;
  do {
    const query = { ...params };
    if (offset) query.offset = offset;
    const data = await airtableFetch(cfg, tableId, { query });
    for (const r of data.records || []) out.push(r);
    offset = data.offset;
  } while (offset);
  return out;
}

function chunk(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

async function upsertByField(cfg, tableId, keyField, items) {
  let created = 0, updated = 0;
  for (const batch of chunk(items, 10)) {
    const keys = batch.map((i) => i.fields?.[keyField]).filter(Boolean);
    let existing = [];
    if (keys.length) {
      const formula = keys.length === 1
        ? `{${keyField}}='${String(keys[0]).replace(/'/g, "\\'")}'`
        : `OR(${keys.map((k) => `{${keyField}}='${String(k).replace(/'/g, "\\'")}'`).join(",")})`;
      existing = await listAllRecords(cfg, tableId, { filterByFormula: formula });
    }
    const byKey = new Map();
    for (const rec of existing) {
      const v = rec.fields?.[keyField];
      if (v != null) byKey.set(String(v), rec);
    }
    const toCreate = [];
    const toUpdate = [];
    for (const item of batch) {
      const key = item.fields?.[keyField];
      const found = key != null ? byKey.get(String(key)) : null;
      if (found) toUpdate.push({ id: found.id, fields: item.fields });
      else toCreate.push({ fields: item.fields });
    }
    if (toCreate.length) {
      await airtableFetch(cfg, tableId, { method: "POST", body: { records: toCreate } });
      created += toCreate.length;
    }
    if (toUpdate.length) {
      await airtableFetch(cfg, tableId, { method: "PATCH", body: { records: toUpdate } });
      updated += toUpdate.length;
    }
  }
  return { created, updated, total: items.length };
}

function fmtDate(ts) {
  if (!ts) return "";
  const n = Number(ts);
  if (!Number.isFinite(n)) return String(ts);
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

function normStatus(s) {
  const v = String(s || "").toLowerCase();
  if (v === "ready" || v === "success" || v === "completed") return "Ready";
  if (v === "building" || v === "queued" || v === "pending") return "Building";
  if (v === "error" || v === "failed" || v === "canceled") return "Failed";
  return "Building";
}

async function syncAll(db, overrides = {}) {
  const cfg = cfgOf(db, overrides);
  requireConfig(cfg);
  const projects = db.listProjects() || [];
  const projectItems = projects.map((p) => ({
    fields: {
      Name: p.name || "",
      Slug: p.slug || db.slugify(p.name || p.id),
      Framework: p.framework || "static",
      CreatedAt: fmtDate(p.created_at),
    },
    _localId: p.id,
  }));

  let allDeps = [];
  for (const p of projects) {
    try { allDeps.push(...(db.listDeployments(p.id) || [])); } catch {}
  }
  const depItems = allDeps.map((d) => {
    const proj = projects.find((p) => p.id === d.project_id) || {};
    let buildLogs = "";
    try {
      const fs = require("fs");
      if (d.log_path && fs.existsSync(d.log_path)) buildLogs = fs.readFileSync(d.log_path, "utf8").slice(-90000);
    } catch {}
    return {
      fields: {
        DeploymentId: d.id,
        ProjectName: proj.name || "",
        Status: normStatus(d.status),
        Branch: d.branch || proj.github_branch || "",
        Duration: d.build_duration_ms != null ? String(d.build_duration_ms) : "",
        BuildLogs: buildLogs || (d.error_message ? String(d.error_message) : ""),
        ArtifactPath: d.artifact_path || d.url_path || "",
      },
      _localId: d.id,
    };
  });

  const allCommits = db.listAllCommits ? db.listAllCommits() : [];
  const commitItems = (allCommits || []).map((c) => ({
    fields: {
      CommitHash: c.sha || "",
      CommitMessage: c.message || "",
      Author: [c.author_name, c.author_email].filter(Boolean).join(c.author_email ? " <" + c.author_email + ">" : "") || c.author_name || "",
      Branch: c.branch || "",
      Timestamp: c.author_date || fmtDate(c.created_at),
      ProjectName: c.project_name || "",
    },
    _localId: c.id,
  }));

  const summary = { projects: { total: 0 }, deployments: { total: 0 }, commits: { total: 0 }, errors: [] };
  try {
    summary.projects = projectItems.length
      ? await upsertByField(cfg, cfg.projectsTable, "Name", projectItems)
      : { created: 0, updated: 0, total: 0 };
  } catch (e) { summary.errors.push(`projects: ${e.message}`); }
  try {
    summary.deployments = depItems.length
      ? await upsertByField(cfg, cfg.deploymentsTable, "DeploymentId", depItems)
      : { created: 0, updated: 0, total: 0 };
  } catch (e) { summary.errors.push(`deployments: ${e.message}`); }
  try {
    summary.commits = commitItems.length
      ? await upsertByField(cfg, cfg.commitsTable, "CommitHash", commitItems)
      : { created: 0, updated: 0, total: 0 };
  } catch (e) { summary.errors.push(`commits: ${e.message}`); }

  const ok = summary.errors.length === 0;
  const status = ok ? "success" : "partial";
  db.setSyncState("airtable", { status, error: ok ? null : summary.errors.join("; "), summary: JSON.stringify(summary) });
  for (const p of projects) db.upsertMapping("airtable", "project", p.id, p.slug || p.name, p.name, { slug: p.slug });
  for (const d of allDeps) db.upsertMapping("airtable", "deployment", d.id, d.id, d.id, { projectId: d.project_id });
  for (const c of allCommits || []) db.upsertMapping("airtable", "commit", c.id, c.sha, c.sha, { projectId: c.project_id });
  return { ok, status, summary, syncedAt: db.now() };
}

async function testConnection(db, overrides = {}) {
  const cfg = cfgOf(db, overrides);
  requireConfig(cfg);
  const res = await airtableFetch(cfg, cfg.projectsTable, { query: { maxRecords: "1" } });
  return { ok: true, baseId: cfg.baseId, sample: (res.records || []).length };
}

module.exports = { DEFAULTS, cfgOf, syncAll, testConnection };
