"use strict";

function cfgOf(db, overrides = {}) {
  const c = db.getIntegrationConfig("vercel") || {};
  return { token: overrides.token || c.token || "", teamId: overrides.teamId || c.teamId || "" };
}

function projectVercel(project, cfg, overrides = {}) {
  return {
    projectId: overrides.vercelProjectId || overrides.projectId || project?.vercel_project_id || "",
    teamId: overrides.vercelTeamId || overrides.teamId || project?.vercel_team_id || cfg.teamId || "",
  };
}

async function vercelFetch(cfg, path, { method = "GET", body, query } = {}) {
  if (!cfg.token) throw new Error("Vercel access token is not configured");
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const url = `https://api.vercel.com${path}${qs}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: text || `HTTP ${res.status}` } }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Vercel API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function withTeam(query, teamId) {
  const q = { ...(query || {}) };
  if (teamId) q.teamId = teamId;
  return q;
}

async function listEnvVars(db, project, opts = {}) {
  const cfg = cfgOf(db, opts);
  const pv = projectVercel(project, cfg, opts);
  if (!pv.projectId) throw new Error("Vercel projectId is not configured for this project");
  const data = await vercelFetch(cfg, `/v10/projects/${encodeURIComponent(pv.projectId)}/env`, {
    query: withTeam({ decrypt: "true" }, pv.teamId),
  });
  const envs = data.envs || data || [];
  return Array.isArray(envs) ? envs : [];
}

async function upsertEnvVar(db, project, payload, opts = {}) {
  const cfg = cfgOf(db, opts);
  const pv = projectVercel(project, cfg, opts);
  if (!pv.projectId) throw new Error("Vercel projectId is not configured for this project");
  const { key, value, target, type, id } = payload || {};
  if (!key) throw new Error("Environment variable key is required");
  if (value == null || value === "") throw new Error("Environment variable value is required");
  const targets = Array.isArray(target) ? target : (target ? [target] : ["production", "preview", "development"]);
  const body = { key: String(key), value: String(value), target: targets, type: type || "encrypted" };
  if (id) {
    return vercelFetch(cfg, `/v10/projects/${encodeURIComponent(pv.projectId)}/env/${encodeURIComponent(id)}`, {
      method: "PATCH", query: withTeam({}, pv.teamId), body,
    });
  }
  return vercelFetch(cfg, `/v10/projects/${encodeURIComponent(pv.projectId)}/env`, {
    method: "POST", query: withTeam({ upsert: "true" }, pv.teamId), body,
  });
}

async function deleteEnvVar(db, project, envId, opts = {}) {
  const cfg = cfgOf(db, opts);
  const pv = projectVercel(project, cfg, opts);
  if (!pv.projectId) throw new Error("Vercel projectId is not configured for this project");
  if (!envId) throw new Error("Vercel env var id is required");
  return vercelFetch(cfg, `/v10/projects/${encodeURIComponent(pv.projectId)}/env/${encodeURIComponent(envId)}`, {
    method: "DELETE", query: withTeam({}, pv.teamId),
  });
}

async function testConnection(db, overrides = {}) {
  const cfg = cfgOf(db, overrides);
  const data = await vercelFetch(cfg, "/v2/user");
  return { ok: true, user: data.user?.username || data.user?.email || data.user?.name || null };
}

module.exports = { cfgOf, projectVercel, listEnvVars, upsertEnvVar, deleteEnvVar, testConnection };
