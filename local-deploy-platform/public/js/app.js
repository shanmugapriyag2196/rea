"use strict";

const API_BASE = "/api";
let projects = [];
let deployments = [];
let currentProjectId = null;

const toast = document.getElementById("toast");

function showToast(message, type = "info") {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => (toast.className = "toast"), 4000);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function formatDuration(ms) {
  if (!ms) return "-";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(status) {
  const labels = { ready: "Ready", building: "Building", error: "Error", pending: "Pending" };
  return `<span class="status-badge status-${status || "pending"}">${labels[status] || status || "Pending"}</span>`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || `HTTP ${res.status}` }; }
  if (!res.ok) {
    const msg = data.error || data.message || `Request failed (${res.status})`;
    if (res.status === 404 || res.status === 405) throw new Error(msg + " — API not available on static hosting. Run locally: cd local-deploy-platform && npm run dev");
    throw new Error(msg);
  }
  return data;
}

function navigateTo(sectionId) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link[data-section]").forEach((l) => l.classList.remove("active"));
  document.getElementById(`section-${sectionId}`)?.classList.add("active");
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add("active");
  document.getElementById("project-detail").style.display = "none";
  document.querySelectorAll(".section").forEach((s) => {
    if (s.id === `section-${sectionId}`) s.classList.add("active");
  });

  // Reset scroll so content (e.g., Commits list) starts at the top
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.querySelector(".main")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });

  if (sectionId === "overview") loadOverview();
  if (sectionId === "projects") loadProjects();
  if (sectionId === "commits") loadAllCommitsPage();
  if (sectionId === "deployments") loadDeployments();
  if (sectionId === "domains") loadDomains();
  if (sectionId === "env") loadEnvProjects();
  if (sectionId === "settings") loadAirtableSettings();
}

async function loadOverview() {
  const empty = document.getElementById("overview-empty");
  const recent = document.getElementById("recent-deployments");
  const note = document.getElementById("overview-source-note");
  try {
    const data = await api("/airtable/dashboard/overview");
    const m = data.metrics || {};
    document.getElementById("stat-projects").textContent = m.totalProjects ?? 0;
    document.getElementById("stat-deployments").textContent = m.totalDeployments ?? 0;
    document.getElementById("stat-ready").textContent = m.ready ?? 0;
    document.getElementById("stat-failed").textContent = m.failed ?? 0;
    if (note) note.textContent = "Metrics from Airtable Deployments table (count of DeploymentId, unique ProjectName, Status Ready/Failed)";
    if (empty) empty.style.display = "none";
    if (recent) recent.style.display = "none";
  } catch (err) {
    document.getElementById("stat-projects").textContent = "0";
    document.getElementById("stat-deployments").textContent = "0";
    document.getElementById("stat-ready").textContent = "0";
    document.getElementById("stat-failed").textContent = "0";
    if (note) note.textContent = "Airtable not connected";
    if (empty) {
      empty.style.display = "flex";
      empty.innerHTML = `<h2>Airtable not connected</h2><p>${escapeHtml(err.message || "Configure Airtable in Settings.")}</p>`;
    }
    if (recent) recent.style.display = "none";
  }
}

async function loadProjects() {
  const tbody = document.getElementById("projects-table-body");
  const empty = document.getElementById("projects-empty");
  const list = document.getElementById("projects-list");
  try {
    const data = await api("/airtable/projects");
    const items = Array.isArray(data.projects) ? data.projects : [];
    projects = items.map((p) => ({ ...p, id: p.id || p.name })); // minimal local shape
    if (!items.length) {
      if (list) list.style.display = "none";
      if (empty) {
        empty.style.display = "flex";
        empty.innerHTML = `<h2>No projects</h2><p>No records found in Airtable Projects table.</p>`;
      }
      if (tbody) tbody.innerHTML = "";
      return;
    }
    if (list) list.style.display = "block";
    if (empty) empty.style.display = "none";
    if (tbody) {
      tbody.innerHTML = items.map((p) => {
        const url = p.repositoryUrl ? String(p.repositoryUrl) : "";
        const safeUrl = /^https?:\/\//i.test(url) ? url : "";
        const name = escapeHtml(p.name || "-");
        const urlCell = safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener" class="commit-link">${escapeHtml(safeUrl)}</a>` : (url ? escapeHtml(url) : "-");
        const created = p.createdAt ? escapeHtml(String(p.createdAt)) : "-";
        return `<tr>
          <td>${name}</td>
          <td class="commit-message">${urlCell}</td>
          <td>${escapeHtml(p.framework || "-")}</td>
          <td>${created}</td>
        </tr>`;
      }).join("");
    }
  } catch (err) {
    if (list) list.style.display = "none";
    if (empty) {
      empty.style.display = "flex";
      empty.innerHTML = `<h2>Airtable not connected</h2><p>${escapeHtml(err.message || "Configure Airtable in Settings.")}</p>`;
    }
    showToast("Failed to load projects from Airtable: " + err.message, "error");
  }
}

async function loadDeployments() {
  try {
    let allDeployments = [];
    for (const p of projects) {
      try {
        const data = await api(`/projects/${p.id}/deployments`);
        const deps = Array.isArray(data) ? data : data.deployments || [];
        deps.forEach((d) => (d.projectName = p.name));
        allDeployments.push(...deps);
      } catch {}
    }
    deployments = allDeployments.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const tbody = document.getElementById("deployments-table-body");
    const empty = document.getElementById("deployments-empty");
    const wrap = document.getElementById("deployments-table-wrap");
    if (wrap) wrap.style.display = "block";
    if (empty) empty.style.display = "none";
    if (tbody) {
      tbody.innerHTML = deployments.map((d) => `
        <tr>
          <td>${escapeHtml(d.projectName || "-")}</td>
          <td>${statusBadge(d.status)}</td>
          <td>${formatDuration(d.build_duration_ms)}</td>
          <td>${formatDate(d.created_at)}</td>
          <td>
            ${d.status === "ready" ? `<a href="/deployments/${d.id}/" target="_blank" class="btn btn-sm btn-outline">Open</a>` : ""}
            <button class="btn btn-sm btn-outline" onclick="rollbackDeployment('${d.id}')">Rollback</button>
          </td>
        </tr>`).join("") || '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;">No deployments</td></tr>';
    }
  } catch (err) {
    showToast("Failed to load deployments: " + err.message, "error");
  }
}

async function loadDomains() {
  try {
    let allDomains = [];
    for (const p of projects) {
      try {
        const data = await api(`/projects/${p.id}/domains`);
        const domains = Array.isArray(data) ? data : data.domains || [];
        domains.forEach((d) => (d.projectName = p.name));
        allDomains.push(...domains);
      } catch {}
    }
    const tbody = document.getElementById("domains-table-body");
    const wrap = document.getElementById("domains-list-wrap");
    if (wrap) wrap.style.display = "block";
    if (tbody) {
      if (allDomains.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="domains-empty"><div class="domains-empty-title">No domains configured</div><div class="domains-empty-text">Add a domain to a project to see it here. (Local-only reference.)</div></div></td></tr>`;
      } else {
        tbody.innerHTML = allDomains.map((d) => `
          <tr>
            <td>${escapeHtml(d.projectName || "-")}</td>
            <td><code>${escapeHtml(d.name || d.domain || "-")}</code></td>
            <td>${escapeHtml(d.environment || "production")}</td>
            <td>${statusBadge(d.verified ? "ready" : "pending")}</td>
            <td style="color:var(--muted);">—</td>
            <td><button class="btn btn-sm btn-outline" onclick="deleteDomain('${d.id}')">Delete</button></td>
          </tr>`).join("");
      }
    }
  } catch (err) {
    showToast("Failed to load domains: " + err.message, "error");
  }
}

async function loadEnvProjects() {
  const select = document.getElementById("env-project");
  if (!select) return;
  select.innerHTML = '<option value="">Select a project</option>';
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

async function loadEnvVars() {
  const projectId = document.getElementById("env-project")?.value;
  const env = document.getElementById("env-environment")?.value || "production";
  const tbody = document.getElementById("env-table-body");
  const empty = document.getElementById("env-empty");
  const wrap = document.getElementById("env-table-wrap");
  if (!projectId) {
    if (wrap) wrap.style.display = "none";
    if (empty) empty.style.display = "flex";
    return;
  }
  try {
    const vars = await api(`/projects/${projectId}/env?environment=${env}`);
    const list = Array.isArray(vars) ? vars : [];
    if (list.length === 0) {
      if (wrap) wrap.style.display = "none";
      if (empty) empty.style.display = "flex";
    } else {
      if (wrap) wrap.style.display = "block";
      if (empty) empty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = list.map((v) => `
          <tr>
            <td><strong>${escapeHtml(v.key)}</strong></td>
            <td>${escapeHtml(v.type)}</td>
            <td><code>${escapeHtml(v.value)}</code></td>
            <td><button class="btn btn-sm btn-outline" onclick="deleteEnvVar('${v.id}', '${projectId}')">Delete</button></td>
          </tr>`).join("");
      }
    }
  } catch (err) {
    showToast("Failed to load env vars: " + err.message, "error");
  }
}

function viewProject(id) {
  const project = projects.find((p) => p.id === id);
  if (!project) return showToast("Project not found", "error");
  currentProjectId = id;
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link[data-section]").forEach((l) => l.classList.remove("active"));
  document.querySelector('[data-section="projects"]')?.classList.add("active");
  document.getElementById("project-detail").style.display = "block";
  document.getElementById("project-detail-name").textContent = project.name;
  document.getElementById("project-detail-description").textContent = project.description || "";
  document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", b.dataset.tab ? b.dataset.tab === "deployments" : i === 0));
  document.querySelectorAll(".tab-content").forEach((tc) => (tc.style.display = tc.id === "tab-deployments" ? "block" : "none"));
  loadProjectDeployments(id);
  loadProjectDetailCommits(id);
}

function openCommitInDashboard(projectId, sha) {
  if (!projectId) { showToast("No project for this commit", "error"); return; }
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    // ensure projects loaded
    api("/projects").then((list) => { projects = Array.isArray(list) ? list : list.projects || []; viewProject(projectId); setTimeout(() => focusProjectCommit(sha), 150); }).catch(() => showToast("Project not found", "error"));
    return;
  }
  viewProject(projectId);
  setTimeout(() => focusProjectCommit(sha), 150);
}

function focusProjectCommit(sha) {
  // switch to commits tab in project detail
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === "commits"));
  document.querySelectorAll(".tab-content").forEach((tc) => (tc.style.display = tc.id === "tab-commits" ? "block" : "none"));
  if (currentProjectId) loadProjectDetailCommits(currentProjectId, sha);
}


function loadProjectDeployments(projectId) {
  const tbody = document.getElementById("project-deployments-table-body");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  api(`/projects/${projectId}/deployments`).then((data) => {
    const deps = Array.isArray(data) ? data : data.deployments || [];
    if (deps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No deployments yet</td></tr>';
      return;
    }
    tbody.innerHTML = deps.map((d) => `
      <tr>
        <td>${statusBadge(d.status)}</td>
        <td>${formatDate(d.created_at)}</td>
        <td>
          ${d.status === "ready" ? `<a href="/deployments/${d.id}/" target="_blank" class="btn btn-sm btn-outline">Open</a>` : ""}
          <button class="btn btn-sm btn-outline" onclick="rollbackDeployment('${d.id}')">Rollback</button>
        </td>
      </tr>`).join("");
  }).catch((e) => {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(e.message)}</td></tr>`;
  });
}

async function loadProjectDetailCommits(projectId) {
  const tbody = document.getElementById("project-detail-commits-body");
  if (!tbody) return;
  try {
    const data = await api(`/projects/${projectId}/github/commits`);
    const commits = data.commits || [];
    if (commits.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No commits found</td></tr>';
      return;
    }
    tbody.innerHTML = commits.map((c) => `
      <tr>
        <td><code>${c.sha.slice(0, 7)}</code></td>
        <td>${escapeHtml((c.message || "").split("\n")[0])}</td>
        <td>${escapeHtml(c.authorName || "")}</td>
        <td>${formatDate(c.authorDate || c.created_at)}</td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = '<tr><td colspan="4">No commits available</td></tr>';
  }
}

  async function loadAllCommitsPage() {
    const tbody = document.getElementById("commits-page-body");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:16px;">Loading commits…</td></tr>';
    window.scrollTo(0, 0);
    document.querySelector(".main")?.scrollTo?.(0, 0);
    try {
      const data = await api("/airtable/commits");
      const commits = Array.isArray(data.commits) ? data.commits : [];
      const subtitle = document.querySelector("#section-commits .section-subtitle");
      if (subtitle) subtitle.textContent = commits.length ? `${commits.length} commits from Airtable` : "From Airtable Commits table";
      if (commits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="commits-empty"><div class="commits-empty-title">No commits</div><div class="commits-empty-text">No records found in Airtable Commits table.</div></div></td></tr>`;
        window.scrollTo(0, 0);
        return;
      }
      tbody.innerHTML = commits.map((c) => {
        const sha = (c.commitHash || "").toString();
        const short = sha ? sha.slice(0, 7) : "—";
        const msg = escapeHtml((c.message || "").split("\n")[0] || "—");
        const author = escapeHtml(c.author || "—");
        const project = escapeHtml(c.projectName || "—");
        const ts = c.timestamp ? escapeHtml(String(c.timestamp)) : "-";
        return `
        <tr class="commit-row">
          <td class="commit-project">${project}</td>
          <td class="commit-sha"><span class="commit-pill" title="${escapeHtml(sha)}">${short}</span></td>
          <td class="commit-message" title="${msg}">${msg}</td>
          <td class="commit-author">${author}</td>
          <td class="commit-date">${ts}</td>
        </tr>`;
      }).join("");
      requestAnimationFrame(() => { window.scrollTo(0, 0); document.querySelector(".main")?.scrollTo?.(0, 0); });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="commits-empty"><div class="commits-empty-title">Airtable not connected</div><div class="commits-empty-text">${escapeHtml(err.message)}</div></div></td></tr>`;
      window.scrollTo(0, 0);
    }
  }

  async function deleteProject(id) {
  if (!confirm("Delete this project?")) return;
  try {
    await api(`/projects/${id}`, { method: "DELETE" });
    showToast("Project deleted", "success");
    loadProjects();
    loadOverview();
  } catch (err) {
    showToast(err.message, "error");
  }
}

let _currentDeploymentId = null;

function setDepTab(tab) {
  document.querySelectorAll(".dep-tab").forEach((b) => b.classList.toggle("active", b.dataset.depTab === tab));
  ["deployment","logs","resources","source","opengraph"].forEach((t) => {
    const p = document.getElementById(`dep-tab-${t}`);
    if (p) p.style.display = t === tab ? "block" : "none";
  });
  if (tab === "logs") loadDeploymentLogsForPage();
}

async function loadDeploymentLogsForPage() {
  const el = document.getElementById("dep-logs-content");
  if (!el || !_currentDeploymentId) return;
  try {
    const data = await api(`/deployments/${_currentDeploymentId}/logs`);
    el.textContent = data.logs || "(no logs)";
  } catch (e) { el.textContent = "Failed to load logs: " + e.message; }
}

async function viewDeployment(id) {
  try {
    const d = await api(`/deployments/${id}`);
    _currentDeploymentId = d && d.id ? d.id : id;
    renderDeploymentPage(d);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showDeploymentDetail(d) { renderDeploymentPage(d); }

function renderDeploymentPage(d) {
  _currentDeploymentId = d && d.id ? d.id : _currentDeploymentId;
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-link[data-section]").forEach((l) => l.classList.remove("active"));
  const pd = document.getElementById("project-detail"); if (pd) pd.style.display = "none";
  const sec = document.getElementById("section-deployment-detail");
  if (!sec) { navigateTo("deployments"); return; }
  sec.classList.add("active");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  const project = d.project || projects.find((p) => p.id === d.project_id) || {};
  const sha = (d.commit_sha || "").toString();
  const short = sha ? sha.slice(0,7) : (d.id || "").slice(0,8);
  const status = d.status || "pending";
  const url = status === "ready" ? `${location.origin}/deployments/${d.id}/` : "";
  const branch = d.branch || project.github_branch || "main";
  const domains = Array.isArray(d.domains) ? d.domains : [];

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  txt("dep-id", short);
  set("dep-subtitle", `Project Deployments · ${escapeHtml(project.name || "Project")}`);
  const visit = document.getElementById("dep-visit");
  if (visit) { visit.style.display = url ? "inline-flex" : "none"; if (url) visit.href = url; }

  txt("dep-created", d.created_at ? new Date(d.created_at).toLocaleString() : "—");
  set("dep-status", `${statusBadge(status)}${status === "ready" ? ' <span style="color:var(--muted);font-size:12px;margin-left:6px;">Current</span>' : ''}`);
  txt("dep-duration", formatDuration(d.build_duration_ms));
  set("dep-env", `<strong style="color:#fff;">${escapeHtml((d.environment || "production").replace(/^./, c=>c.toUpperCase()))}</strong>${status === "ready" ? ' <span class="dep-pill">Current</span>' : ''}`);
  set("dep-domains", domains.length ? domains.map(x => `<div><span style="color:#fff;">${escapeHtml(x.name || x.domain)}</span></div>`).join("") : (url ? `<a href="${url}" target="_blank" rel="noopener" style="color:#fff;">${escapeHtml(location.host)}/deployments/${escapeHtml(d.id)}/</a>` : '<span style="color:var(--muted);">No domain</span>'));
  set("dep-source", `<div><span class="dep-pill">${escapeHtml(branch)}</span></div><div style="margin-top:6px;"><code>${escapeHtml(short)}</code> ${d.commit?.message ? `<span style="color:#ccc;">${escapeHtml((d.commit.message||'').split('\n')[0])}</span>` : ''}</div>`);

  txt("dep-build-summary", status === "ready" ? `Build completed in ${formatDuration(d.build_duration_ms)} · ${d.file_count || 0} files` : (d.error_message ? d.error_message : "—"));
  set("dep-summary-rows", [
    ["Project", escapeHtml(project.name || "—")],
    ["Deployment ID", `<code>${escapeHtml(d.id || '')}</code>`],
    ["Commit", sha ? `<code>${escapeHtml(short)}</code>` : "—"],
    ["Branch", escapeHtml(branch)],
    ["Files", escapeHtml(String(d.file_count ?? "—"))],
    ["Total size", d.total_size ? escapeHtml((d.total_size/1024).toFixed(1) + " KB") : "—"],
  ].map(([k,v]) => `<div class="dep-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join(""));
  set("dep-source-rows", [
    ["Repository", escapeHtml(project.github_repo_url || "—")],
    ["Branch", escapeHtml(branch)],
    ["Commit", sha ? `<code>${escapeHtml(sha)}</code>` : "—"],
    ["Author", escapeHtml(d.commit?.author_name || "—")],
    ["Date", escapeHtml(d.commit?.author_date || "—")],
  ].map(([k,v]) => `<div class="dep-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join(""));

  const logs = document.getElementById("dep-logs-content");
  if (logs) logs.textContent = "Loading…";
  setDepTab("deployment");
}

async function openCommitDeployment(projectId, sha) {
  if (!projectId || !sha) return showToast("Missing project/commit", "error");
  try {
    showToast(`Opening deployment for ${sha.slice(0,7)}…`, "info");
    if (!projects.length) { try { projects = await api("/projects"); } catch {} }
    const data = await api(`/projects/${projectId}/commits/${encodeURIComponent(sha)}/deployment`);
    let dep = data && data.deployment;
    if (!dep) {
      showToast(`Creating deployment for ${sha.slice(0,7)}…`, "info");
      const created = await api(`/projects/${projectId}/deploy-commit`, { method: "POST", body: JSON.stringify({ sha }) });
      dep = created.deployment;
      if (!dep) throw new Error(created.error || "Deployment was not created");
    }
    _currentDeploymentId = dep.id;
    const full = await api(`/deployments/${dep.id}`);
    if (full && !full.commit && data.commit) full.commit = data.commit;
    renderDeploymentPage(full);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function rollbackDeployment(id) {
  if (!confirm("Rollback to this deployment?")) return;
  try {
    await api(`/deployments/${id}/rollback`, { method: "POST" });
    showToast("Rollback successful", "success");
    loadDeployments();
    if (currentProjectId) loadProjectDeployments(currentProjectId);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteDomain(id) {
  if (!confirm("Delete this domain?")) return;
  try {
    await api(`/domains/${id}`, { method: "DELETE" });
    showToast("Domain deleted", "success");
    loadDomains();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteEnvVar(id, projectId) {
  if (!confirm("Delete this variable?")) return;
  try {
    await api(`/projects/${projectId}/env/${id}`, { method: "DELETE" });
    showToast("Variable deleted", "success");
    loadEnvVars();
  } catch (err) {
    showToast(err.message, "error");
  }
}

window.viewProject = viewProject;
window.openCommitInDashboard = openCommitInDashboard;
window.openCommitDeployment = openCommitDeployment;
window.showDeploymentDetail = showDeploymentDetail;
window.renderDeploymentPage = renderDeploymentPage;
window.setDepTab = setDepTab;
window.deleteProject = deleteProject;
window.viewDeployment = viewDeployment;
window.rollbackDeployment = rollbackDeployment;
window.deleteDomain = deleteDomain;
window.deleteEnvVar = deleteEnvVar;
window.loadProjectDetailCommits = loadProjectDetailCommits;

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-link[data-section]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(link.dataset.section);
    });
  });

  document.getElementById("back-to-projects")?.addEventListener("click", () => navigateTo("projects"));
  document.getElementById("dep-back")?.addEventListener("click", () => navigateTo("deployments"));
  document.getElementById("new-project-btn")?.addEventListener("click", () => navigateTo("projects"));
  document.querySelectorAll(".dep-tab").forEach((btn) => btn.addEventListener("click", () => { if (!btn.disabled) setDepTab(btn.dataset.depTab); }));

  document.getElementById("show-import-git-modal")?.addEventListener("click", () => {
    document.getElementById("github-import-modal").classList.add("open");
  });
  document.getElementById("close-github-import")?.addEventListener("click", () => {
    document.getElementById("github-import-modal").classList.remove("open");
  });

  document.getElementById("load-github-repos")?.addEventListener("click", async () => {
    const token = document.getElementById("github-token-input").value;
    if (!token) return showToast("Enter GitHub token", "error");
    localStorage.setItem("github_token", token);
    document.getElementById("github-repos-list").style.display = "block";
    document.getElementById("github-repos-loading").style.display = "block";
    document.getElementById("github-repos-items").style.display = "none";
    try {
      const res = await fetch(`${API_BASE}/github/repos`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      document.getElementById("github-repos-loading").style.display = "none";
      document.getElementById("github-repos-items").style.display = "block";
      document.getElementById("github-repos-items").innerHTML = (data.repos || []).map((r) => `
        <div style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="window._selRepo('${r.full_name}')">
          <div style="font-weight:500;">${escapeHtml(r.full_name)}</div>
          <div style="font-size:12px;color:var(--muted);">${escapeHtml(r.description || "")}</div>
        </div>`).join("");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  window._selRepo = (fullName) => {
    document.getElementById("import-repo-url").value = `https://github.com/${fullName}.git`;
    document.getElementById("import-repo-name").value = fullName.split("/")[1];
  };

  document.getElementById("do-import-git")?.addEventListener("click", async () => {
    const repoUrl = document.getElementById("import-repo-url").value;
    const projectName = document.getElementById("import-repo-name").value;
    if (!repoUrl || !projectName) return showToast("Repo URL and name required", "error");
    try {
      showToast("Importing repository and fetching all commits...", "info");
      const result = await api("/projects/import-git", {
        method: "POST",
        body: JSON.stringify({ repoUrl, projectName }),
      });
      document.getElementById("github-import-modal").classList.remove("open");
      showToast(`Imported ${projectName} (${result.commitCount || 0} commits)`, "success");
      loadProjects();
      loadOverview();
      // Navigate to Commits tab to show all commits
      setTimeout(() => {
        navigateTo("commits");
      }, 500);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((tc) => (tc.style.display = "none"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
      if (btn.dataset.tab === "commits" && currentProjectId) loadProjectDetailCommits(currentProjectId);
    });
  });

  document.getElementById("deploy-project-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = document.getElementById("deploy-zip").files[0];
    if (!file) return showToast("Select a ZIP file", "error");
    const fd = new FormData();
    fd.append("zip", file);
    try {
      showToast("Deploying...", "info");
      const res = await fetch(`${API_BASE}/projects/${currentProjectId}/deployments`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy failed");
      showToast("Deployment created", "success");
      loadProjectDeployments(currentProjectId);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  document.getElementById("env-project")?.addEventListener("change", loadEnvVars);
  document.getElementById("env-environment")?.addEventListener("change", loadEnvVars);

  document.getElementById("deployment-project-filter")?.addEventListener("change", loadDeployments);
  document.getElementById("deployment-status-filter")?.addEventListener("change", loadDeployments);

  document.getElementById("show-add-env-btn")?.addEventListener("click", () => {
    const projectId = document.getElementById("env-project").value;
    if (!projectId) return showToast("Select a project first", "error");
    const key = prompt("Variable key:");
    const value = prompt("Variable value:");
    if (!key || !value) return;
    api(`/projects/${projectId}/env`, {
      method: "POST",
      body: JSON.stringify({ key, value, type: "config", environment: document.getElementById("env-environment").value }),
    }).then(() => { showToast("Variable added", "success"); loadEnvVars(); }).catch((e) => showToast(e.message, "error"));
  });

  document.getElementById("save-airtable-settings")?.addEventListener("click", saveAirtableSettings);
  document.getElementById("test-airtable-settings")?.addEventListener("click", () => { loadOverview(); loadProjects(); loadAllCommitsPage(); showToast("Reloading Airtable data...", "info"); });

  loadOverview();
});


async function loadAirtableSettings() {
  const status = document.getElementById("airtable-settings-status");
  try {
    const c = await api("/integrations/airtable/config");
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.type !== "password") el.value = v || ""; };
    set("airtable-base-id", c.baseId || "appKbcUHLOb0igCmB");
    set("airtable-deployments-table-id", c.deploymentsTableId || "tblxLdckVeOeRfrVB");
    set("airtable-projects-table-id", c.projectsTableId || "");
    set("airtable-commits-table-id", c.commitsTableId || "");
    const pat = document.getElementById("airtable-pat");
    if (pat) pat.value = "";
    if (status) status.textContent = c.hasPat ? `Token configured (${c.patMasked}). Leave PAT blank to keep current token.` : "No Airtable token saved yet. Enter PAT and table IDs, then Save.";
  } catch (err) {
    if (status) status.textContent = "Failed to load Airtable settings: " + err.message;
  }
}

async function saveAirtableSettings() {
  const status = document.getElementById("airtable-settings-status");
  const btn = document.getElementById("save-airtable-settings");
  if (btn) btn.disabled = true;
  try {
    const body = {
      pat: (document.getElementById("airtable-pat")?.value || "").trim(),
      baseId: (document.getElementById("airtable-base-id")?.value || "").trim(),
      deploymentsTableId: (document.getElementById("airtable-deployments-table-id")?.value || "").trim(),
      projectsTableId: (document.getElementById("airtable-projects-table-id")?.value || "").trim(),
      commitsTableId: (document.getElementById("airtable-commits-table-id")?.value || "").trim(),
    };
    const res = await api("/integrations/airtable/config", { method: "POST", body: JSON.stringify(body) });
    const pat = document.getElementById("airtable-pat"); if (pat) pat.value = "";
    const c = res.config || {};
    if (status) status.textContent = c.hasPat ? `Saved. Token: ${c.patMasked}. Reloading dashboard data...` : "Saved (no token configured).";
    showToast("Airtable settings saved", "success");
    await Promise.allSettled([loadOverview(), loadProjects(), loadAllCommitsPage()]);
  } catch (err) {
    if (status) status.textContent = "Save failed: " + err.message;
    showToast("Failed to save Airtable settings: " + err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
