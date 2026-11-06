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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
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

  if (sectionId === "overview") loadOverview();
  if (sectionId === "projects") loadProjects();
  if (sectionId === "commits") loadAllCommitsPage();
  if (sectionId === "deployments") loadDeployments();
  if (sectionId === "domains") loadDomains();
  if (sectionId === "env") loadEnvProjects();
}

async function loadOverview() {
  try {
    projects = await api("/projects");
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

    document.getElementById("stat-projects").textContent = projects.length;
    document.getElementById("stat-deployments").textContent = deployments.length;
    document.getElementById("stat-ready").textContent = deployments.filter((d) => d.status === "ready").length;
    document.getElementById("stat-failed").textContent = deployments.filter((d) => d.status === "error").length;

    const empty = document.getElementById("overview-empty");
    const recent = document.getElementById("recent-deployments");
    const tbody = document.getElementById("recent-deployments-body");

    if (projects.length === 0) {
      if (empty) empty.style.display = "flex";
      if (recent) recent.style.display = "none";
    } else {
      if (empty) empty.style.display = "none";
      if (recent) recent.style.display = "block";
      if (tbody) {
        tbody.innerHTML = deployments.slice(0, 5).map((d) => `
          <tr>
            <td>${escapeHtml(d.projectName || "-")}</td>
            <td><code>${(d.commit_sha || d.version || "-").toString().slice(0, 7)}</code></td>
            <td>${statusBadge(d.status)}</td>
            <td>${formatDuration(d.build_duration_ms)}</td>
            <td>${formatDate(d.created_at)}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewDeployment('${d.id}')">View</button></td>
          </tr>`).join("");
      }
    }
  } catch (err) {
    showToast("Failed to load overview: " + err.message, "error");
  }
}

async function loadProjects() {
  try {
    projects = await api("/projects");
    const tbody = document.getElementById("projects-table-body");
    const empty = document.getElementById("projects-empty");
    const list = document.getElementById("projects-list");
    if (projects.length === 0) {
      if (list) list.style.display = "none";
      if (empty) empty.style.display = "flex";
    } else {
      if (list) list.style.display = "block";
      if (empty) empty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = projects.map((p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.framework || "static")}</td>
            <td>${formatDate(p.created_at)}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="viewProject('${p.id}')">View</button>
              <button class="btn btn-sm btn-outline" onclick="deleteProject('${p.id}')">Delete</button>
            </td>
          </tr>`).join("");
      }
    }
  } catch (err) {
    showToast("Failed to load projects: " + err.message, "error");
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
  document.getElementById("project-detail").style.display = "block";
  document.getElementById("project-detail-name").textContent = project.name;
  document.getElementById("project-detail-description").textContent = project.description || "";
  document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
  document.querySelectorAll(".tab-content").forEach((tc, i) => (tc.style.display = i === 0 ? "block" : "none"));
  loadProjectDeployments(id);
  loadProjectDetailCommits(id);
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
    const data = await api(`/projects/${projectId}/github/commits?limit=100`);
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
    try {
      const data = await api("/commits");
      const commits = Array.isArray(data) ? data : data.commits || [];
      if (commits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="commits-empty"><div class="commits-empty-title">No commits yet</div><div class="commits-empty-text">Import a Git repository to fetch and display all commits, like Vercel.</div></div></td></tr>`;
        return;
      }
      tbody.innerHTML = commits.map((c) => {
        const sha = (c.sha || "").toString();
        const short = sha.slice(0, 7);
        const msg = escapeHtml((c.message || "").split("\n")[0] || "—");
        const author = escapeHtml(c.author_name || c.authorName || "—");
        const project = escapeHtml(c.project_name || c.projectName || "—");
        const date = formatDate(c.author_date || c.authorDate || c.created_at);
        return `
        <tr class="commit-row">
          <td class="commit-project">${project}</td>
          <td class="commit-sha"><span class="commit-pill" title="${escapeHtml(sha)}">${short || "—"}</span></td>
          <td class="commit-message" title="${msg}">${msg}</td>
          <td class="commit-author">${author}</td>
          <td class="commit-date">${date}</td>
        </tr>`;
      }).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="commits-empty"><div class="commits-empty-title">Could not load commits</div><div class="commits-empty-text">${escapeHtml(err.message)}</div></div></td></tr>`;
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

async function viewDeployment(id) {
  try {
    const d = await api(`/deployments/${id}`);
    alert(`Deployment ${d.id}\nStatus: ${d.status}\nCreated: ${formatDate(d.created_at)}`);
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
  document.getElementById("new-project-btn")?.addEventListener("click", () => navigateTo("projects"));

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

  loadOverview();
});
