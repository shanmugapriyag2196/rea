"use strict";

const API_BASE = "/api";
const HOST = window.location.hostname;
const PORT = window.location.port;

// ---------- State ----------
let currentSection = "overview";
let projects = [];
let deployments = [];
let currentProjectId = null;

// ---------- DOM Elements ----------
const sections = document.querySelectorAll(".section");
const navLinks = document.querySelectorAll(".nav-link");
const toast = document.getElementById("toast");

// ---------- Utility Functions ----------
function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 4000);
}

function navigateTo(sectionId) {
  currentSection = sectionId;
  sections.forEach((s) => s.classList.remove("active"));
  navLinks.forEach((l) => l.classList.remove("active"));

  const section = document.getElementById(`section-${sectionId}`);
  const link = document.querySelector(`[data-section="${sectionId}"]`);

  if (section) section.classList.add("active");
  if (link) link.classList.add("active");

  // Section-specific initialization
  if (sectionId === "projects") loadProjects();
  if (sectionId === "commits") loadAllCommitsPage();
  if (sectionId === "deployments") loadDeployments();
  if (sectionId === "build-logs") loadBuildLogDeployments();
  if (sectionId === "domains") loadDomains();
  if (sectionId === "env") loadEnvProjects();
  if (sectionId === "overview") loadOverview();
}

function formatDate(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function formatDuration(ms) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusBadge(status) {
  const classes = {
    ready: "status-ready",
    building: "status-building",
    error: "status-error",
    pending: "status-pending",
    canceled: "status-canceled",
  };
  const cls = classes[status] || "status-pending";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status-badge ${cls}">${label}</span>`;
}

// ---------- API Calls ----------
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

// ---------- Overview ----------
async function loadOverview() {
  try {
    const [projList, depList] = await Promise.all([
      api("/projects"),
      api("/deployments?projectId="), // will be filtered client-side since we don't have project filter yet
    ]);

    projects = projList;
    // We need all deployments - fetch per project
    const allDeployments = [];
    for (const p of projects) {
      try {
        const deps = await api(`/projects/${p.id}/deployments`);
        deps.forEach((d) => (d.projectName = p.name));
        allDeployments.push(...deps);
      } catch (e) {
        // ignore per-project errors
      }
    }
    deployments = allDeployments.sort((a, b) => b.created_at - a.created_at);

    document.getElementById("stat-projects").textContent = projects.length;
    document.getElementById("stat-deployments").textContent = deployments.length;
    document.getElementById("stat-ready").textContent = deployments.filter((d) => d.status === "ready").length;
    document.getElementById("stat-failed").textContent = deployments.filter((d) => d.status === "error").length;

    const empty = document.getElementById("overview-empty");
    const recent = document.getElementById("recent-deployments");
    const tbody = document.getElementById("recent-deployments-body");

    if (projects.length === 0) {
      empty.style.display = "flex";
      recent.style.display = "none";
    } else {
      empty.style.display = "none";
      recent.style.display = "block";
      tbody.innerHTML = deployments
        .slice(0, 5)
        .map(
          (d) => `
          <tr>
            <td>${escapeHtml(d.projectName)}</td>
            <td>${d.version}</td>
            <td>${statusBadge(d.status)}</td>
            <td>${formatDuration(d.build_duration_ms)}</td>
            <td>
              ${d.status === "ready" ? `<a href="http://${HOST}:${PORT}/deployments/${d.id}/" target="_blank" rel="noopener noreferrer">Open</a>` : "-"}
            </td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="viewDeployment('${d.id}')">View</button>
            </td>
          </tr>
        `
        )
        .join("");
    }
  } catch (err) {
    showToast("Failed to load overview: " + err.message, "error");
  }
}

// ---------- Commits (all) ----------
async function loadAllCommitsPage() {
  const tbody = document.getElementById("commits-page-body");
  const empty = document.getElementById("commits-page-empty");
  const wrap = document.getElementById("commits-page-wrap");
  if (!tbody) return;
  try {
    const data = await api("/commits?limit=200");
    if (!data.commits || data.commits.length === 0) {
      if (wrap) wrap.style.display = "none";
      if (empty) empty.style.display = "flex";
      return;
    }
    if (empty) empty.style.display = "none";
    if (wrap) wrap.style.display = "block";
    tbody.innerHTML = data.commits
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.project_name || "-")}</td>
          <td><code>${c.sha.slice(0, 7)}</code></td>
          <td>${escapeHtml(c.message)}</td>
          <td>${escapeHtml(c.authorName)}</td>
          <td>${c.authorDate ? new Date(c.authorDate).toLocaleString() : "-"}</td>
          <td>
            ${c.htmlUrl ? `<a href="${c.htmlUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">View</a>` : "-"}
          </td>
        </tr>
      `
      )
      .join("");
  } catch (err) {
    showToast("Failed to load commits: " + err.message, "error");
  }
}

// ---------- Projects ----------
async function loadProjects() {
  try {
    projects = await api("/projects");
    const tbody = document.getElementById("projects-table-body");
    const empty = document.getElementById("projects-empty");
    const listWrap = document.getElementById("projects-list");

    if (projects.length === 0) {
      listWrap.style.display = "none";
      empty.style.display = "flex";
    } else {
      listWrap.style.display = "block";
      empty.style.display = "none";
      tbody.innerHTML = projects
        .map(
          (p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${p.framework}</td>
            <td>-</td>
            <td>${formatDate(p.created_at)}</td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="viewProject('${p.id}')">View</button>
              <button class="btn btn-outline btn-sm" onclick="deleteProject('${p.id}')">Delete</button>
            </td>
          </tr>
        `
        )
        .join("");
    }
  } catch (err) {
    showToast("Failed to load projects: " + err.message, "error");
  }
}

async function createProjectFromForm(formData) {
  try {
    const project = await api("/projects", {
      method: "POST",
      body: JSON.stringify(formData),
    });
    closeModal("create-project-modal");
    document.getElementById("create-project-form").reset();
    showToast(`Project "${project.name}" created`, "success");
    loadProjects();
    loadOverview();
    populateProjectSelects();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteProject(id) {
  if (!confirm("Are you sure you want to delete this project? This will delete all its deployments.")) return;
  try {
    await api(`/projects/${id}`, { method: "DELETE" });
    showToast("Project deleted", "success");
    loadProjects();
    loadOverview();
    populateProjectSelects();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------- Deployments ----------
async function loadDeployments() {
  try {
    const projectFilter = document.getElementById("deployment-project-filter").value;
    const statusFilter = document.getElementById("deployment-status-filter").value;

    let allDeployments = [];
    for (const p of projects) {
      try {
        const deps = await api(`/projects/${p.id}/deployments`);
        deps.forEach((d) => (d.projectName = p.name));
        allDeployments.push(...deps);
      } catch (e) {}
    }
    deployments = allDeployments.sort((a, b) => b.created_at - a.created_at);

    if (projectFilter) {
      deployments = deployments.filter((d) => d.project_id === projectFilter);
    }
    if (statusFilter) {
      deployments = deployments.filter((d) => d.status === statusFilter);
    }

    const tbody = document.getElementById("deployments-table-body");
    const empty = document.getElementById("deployments-empty");
    const wrap = document.getElementById("deployments-table-wrap");

    if (deployments.length === 0) {
      wrap.style.display = "none";
      empty.style.display = "flex";
    } else {
      wrap.style.display = "block";
      empty.style.display = "none";
      tbody.innerHTML = deployments
        .map(
          (d) => `
          <tr>
            <td>${escapeHtml(d.projectName)}</td>
            <td>${d.version}</td>
            <td>${statusBadge(d.status)}</td>
            <td>${formatDuration(d.build_duration_ms)}</td>
            <td>${d.file_count || 0}</td>
            <td>${formatDate(d.created_at)}</td>
            <td>
              ${d.status === "ready"
                ? `<a href="http://${HOST}:${PORT}/deployments/${d.id}/" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">Open</a>`
                : "-"}
              <button class="btn btn-outline btn-sm" onclick="viewDeployment('${d.id}')">Details</button>
              ${d.status === "ready" ? `<button class="btn btn-outline btn-sm" onclick="rollbackDeployment('${d.id}')">Rollback</button>` : ""}
            </td>
          </tr>
        `
        )
        .join("");
    }

    populateProjectFilter();
  } catch (err) {
    showToast("Failed to load deployments: " + err.message, "error");
  }
}

async function populateProjectFilter() {
  const select = document.getElementById("deployment-project-filter");
  const current = select.value;
  select.innerHTML = '<option value="">All Projects</option>';
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  select.value = current;
}

async function rollbackDeployment(id) {
  if (!confirm("Roll back to this deployment? This will make it the active production deployment.")) return;
  try {
    const result = await api(`/deployments/${id}/rollback`, { method: "POST" });
    showToast(result.message, "success");
    loadDeployments();
    loadOverview();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function viewDeployment(id) {
  const d = await api(`/deployments/${id}`);
  alert(
    `Deployment Details\n\nID: ${d.id}\nProject: ${d.project_id}\nVersion: ${d.version}\nStatus: ${d.status}\nURL: http://${HOST}:${PORT}/deployments/${d.id}/\nCreated: ${formatDate(d.created_at)}\nDuration: ${formatDuration(d.build_duration_ms)}\nFiles: ${d.file_count || 0}\nError: ${d.error_message || "None"}`
  );
}

// ---------- Build Logs ----------
async function loadBuildLogDeployments() {
  const select = document.getElementById("build-log-deployment");
  select.innerHTML = '<option value="">Select a deployment</option>';

  for (const p of projects) {
    try {
      const deps = await api(`/projects/${p.id}/deployments`);
      deps.forEach((d) => {
        d.projectName = p.name;
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = `${p.name} v${d.version} (${d.status})`;
        select.appendChild(opt);
      });
    } catch (e) {}
  }
}

async function loadBuildLogs() {
  const select = document.getElementById("build-log-deployment");
  const deploymentId = select.value;
  const content = document.getElementById("build-log-content");
  const empty = document.getElementById("build-logs-empty");
  const container = document.getElementById("log-container");

  if (!deploymentId) {
    content.textContent = "Select a deployment to view its logs.";
    container.style.display = "none";
    empty.style.display = "flex";
    return;
  }

  try {
    const { logs } = await api(`/deployments/${deploymentId}/logs`);
    container.style.display = "block";
    empty.style.display = "none";

    // Colorize log lines
    const lines = logs.split("\n");
    const colored = lines
      .map((line) => {
        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("fail")) {
          return `<span class="log-line-error">${escapeHtml(line)}</span>`;
        }
        if (line.toLowerCase().includes("warn")) {
          return `<span class="log-line-warn">${escapeHtml(line)}</span>`;
        }
        if (line.toLowerCase().includes("success") || line.toLowerCase().includes("completed")) {
          return `<span class="log-line-info">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
      })
      .join("\n");

    content.innerHTML = colored;
    content.scrollTop = content.scrollHeight;
  } catch (err) {
    content.textContent = "Failed to load logs: " + err.message;
  }
}

// ---------- Domains ----------
async function loadDomains() {
  try {
    let allDomains = [];
    for (const p of projects) {
      try {
        const deps = await api(`/projects/${p.id}/domains`);
        deps.forEach((d) => (d.projectName = p.name));
        allDomains.push(...deps);
      } catch (e) {}
    }

    const tbody = document.getElementById("domains-table-body");
    const empty = document.getElementById("domains-empty");
    const wrap = document.getElementById("domains-list-wrap");

    if (allDomains.length === 0) {
      wrap.style.display = "none";
      empty.style.display = "flex";
    } else {
      wrap.style.display = "block";
      empty.style.display = "none";
      tbody.innerHTML = allDomains
        .map(
          (d) => `
          <tr>
            <td>${escapeHtml(d.projectName)}</td>
            <td>${escapeHtml(d.name)}</td>
            <td>${d.environment}</td>
            <td>${statusBadge(d.verified ? "ready" : "pending")}</td>
            <td>${d.ssl_status}</td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="deleteDomain('${d.id}')">Delete</button>
            </td>
          </tr>
        `
        )
        .join("");
    }

    populateDomainProjectSelect();
  } catch (err) {
    showToast("Failed to load domains: " + err.message, "error");
  }
}

async function addDomainFromForm(formData) {
  try {
    const domain = await api(`/projects/${formData.projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: formData.name, environment: formData.environment }),
    });
    closeModal("add-domain-modal");
    document.getElementById("add-domain-form").reset();
    showToast(`Domain "${domain.name}" added`, "success");
    loadDomains();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function verifyDomain(id) {
  try {
    await api(`/domains/${id}/verify`, { method: "POST" });
    showToast("Domain verified", "success");
    loadDomains();
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

async function populateDomainProjectSelect() {
  const select = document.getElementById("domain-project");
  select.innerHTML = "";
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// ---------- Environment Variables ----------
async function loadEnvProjects() {
  const select = document.getElementById("env-project");
  select.innerHTML = '<option value="">Select a project</option>';
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

async function loadEnvVars() {
  const projectSelect = document.getElementById("env-project");
  const envSelect = document.getElementById("env-environment");
  const projectId = projectSelect.value;
  const environment = envSelect.value;

  const tbody = document.getElementById("env-table-body");
  const empty = document.getElementById("env-empty");
  const wrap = document.getElementById("env-table-wrap");

  if (!projectId) {
    wrap.style.display = "none";
    empty.style.display = "flex";
    empty.querySelector("h2").textContent = "Select a project";
    empty.querySelector("p").textContent = "Choose a project to view its environment variables.";
    return;
  }

  try {
    const vars = await api(`/projects/${projectId}/env?environment=${environment}`);

    if (vars.length === 0) {
      wrap.style.display = "none";
      empty.style.display = "flex";
      empty.querySelector("h2").textContent = "No environment variables";
      empty.querySelector("p").textContent = `No environment variables for ${environment} environment.`;
    } else {
      wrap.style.display = "block";
      empty.style.display = "none";
      tbody.innerHTML = vars
        .map(
          (v) => `
          <tr>
            <td><strong>${escapeHtml(v.key)}</strong></td>
            <td><span class="status-badge ${v.type === "secret" ? "status-error" : "status-ready"}">${v.type}</span></td>
            <td>${v.environment}</td>
            <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(v.value)}</code></td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="deleteEnvVar('${v.id}')">Delete</button>
            </td>
          </tr>
        `
        )
        .join("");
    }
  } catch (err) {
    showToast("Failed to load environment variables: " + err.message, "error");
  }
}

async function addEnvVarFromForm(formData) {
  try {
    const variable = await api(`/projects/${formData.projectId}/env`, {
      method: "POST",
      body: JSON.stringify({
        key: formData.key,
        value: formData.value,
        type: formData.type,
        environment: formData.environment,
      }),
    });
    closeModal("add-env-modal");
    document.getElementById("add-env-form").reset();
    showToast(`Variable "${variable.key}" saved`, "success");
    loadEnvVars();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteEnvVar(id) {
  if (!confirm("Delete this environment variable?")) return;
  try {
    await api(`/projects/placeholder/env/${id}`, { method: "DELETE" });
    showToast("Variable deleted", "success");
    loadEnvVars();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------- Helpers ----------
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add("open");
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("open");
}

function populateProjectSelects() {
  const domainSelect = document.getElementById("domain-project");
  const envSelect = document.getElementById("env-project");
  const currentDomain = domainSelect.value;
  const currentEnv = envSelect.value;

  domainSelect.innerHTML = "";
  envSelect.innerHTML = '<option value="">Select a project</option>';

  projects.forEach((p) => {
    const dOpt = document.createElement("option");
    dOpt.value = p.id;
    dOpt.textContent = p.name;
    domainSelect.appendChild(dOpt);

    const eOpt = document.createElement("option");
    eOpt.value = p.id;
    eOpt.textContent = p.name;
    envSelect.appendChild(eOpt);
  });

  domainSelect.value = currentDomain;
  envSelect.value = currentEnv;
}

// ---------- Event Listeners ----------
document.addEventListener("DOMContentLoaded", () => {
  // Navigation
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(link.dataset.section);
    });
  });

  // New Project buttons (header + projects section)
  const newProjectBtn = document.getElementById("new-project-btn");
  const showCreateProjectForm = document.getElementById("show-create-project-form");
  const createProjectFormContainer = document.getElementById("create-project-form-container");
  const importGitFormContainer = document.getElementById("import-git-form-container");

  function showCreateProjectFormUI() {
    if (createProjectFormContainer) createProjectFormContainer.style.display = "block";
    if (importGitFormContainer) importGitFormContainer.style.display = "none";
  }

  if (newProjectBtn) newProjectBtn.addEventListener("click", showCreateProjectFormUI);
  if (showCreateProjectForm) showCreateProjectForm.addEventListener("click", showCreateProjectFormUI);

  // Create project form
  const createProjectInlineForm = document.getElementById("create-project-inline-form");
  if (createProjectInlineForm) {
    createProjectInlineForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = {
        name: document.getElementById("project-name-inline").value,
        description: document.getElementById("project-description-inline").value,
        framework: document.getElementById("project-framework-inline").value,
      };
      try {
        showToast("Creating project...", "info");
        const project = await api("/projects", {
          method: "POST",
          body: JSON.stringify(formData),
        });
        if (createProjectFormContainer) createProjectFormContainer.style.display = "none";
        createProjectInlineForm.reset();
        showToast(`Project "${project.name}" created`, "success");
        loadProjects();
        loadOverview();
        populateProjectSelects();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  // Cancel create project
  const cancelCreateProjectInline = document.getElementById("cancel-create-project-inline");
  if (cancelCreateProjectInline && createProjectFormContainer) {
    cancelCreateProjectInline.addEventListener("click", () => {
      createProjectFormContainer.style.display = "none";
      createProjectInlineForm.reset();
    });
  }

  // Import Git form
  const showImportGitForm = document.getElementById("show-import-git-form");
  if (showImportGitForm) {
    showImportGitForm.addEventListener("click", () => {
      if (importGitFormContainer) importGitFormContainer.style.display = "block";
      if (createProjectFormContainer) createProjectFormContainer.style.display = "none";
    });
  }

  const cancelImportGit = document.getElementById("cancel-import-git");
  if (cancelImportGit && importGitFormContainer) {
    cancelImportGit.addEventListener("click", () => {
      importGitFormContainer.style.display = "none";
      document.getElementById("import-git-form").reset();
    });
  }

  document.getElementById("import-git-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repoUrl = document.getElementById("git-repo-url").value;
    const projectName = document.getElementById("git-project-name").value;

    if (!repoUrl || !projectName) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    try {
      showToast("Importing repository...", "info");
      const result = await api("/projects/import-git", {
        method: "POST",
        body: JSON.stringify({ repoUrl, projectName }),
      });
      importGitFormContainer.style.display = "none";
      document.getElementById("import-git-form").reset();
      showToast(`Repository imported as "${result.project.name}" (${result.commitCount || 0} commits)`, "success");
      loadProjects();
      loadOverview();
      populateProjectSelects();
      setTimeout(() => viewProject(result.project.id), 500);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Deployment filters
  document.getElementById("deployment-project-filter").addEventListener("change", loadDeployments);
  document.getElementById("deployment-status-filter").addEventListener("change", loadDeployments);

  // Build logs
  document.getElementById("build-log-deployment").addEventListener("change", loadBuildLogs);
  document.getElementById("refresh-logs").addEventListener("click", loadBuildLogs);

  // Add domain form
  document.getElementById("add-domain-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = {
      projectId: document.getElementById("domain-project").value,
      name: document.getElementById("domain-name").value,
      environment: document.getElementById("domain-environment").value,
    };
    addDomainFromForm(formData);
  });

  document.getElementById("close-add-domain").addEventListener("click", () => closeModal("add-domain-modal"));
  document.getElementById("cancel-add-domain").addEventListener("click", () => closeModal("add-domain-modal"));

  // Environment variables - inline form
  document.getElementById("show-add-env-btn").addEventListener("click", () => {
    document.getElementById("add-env-form-container").style.display = "block";
  });

  document.getElementById("cancel-add-env-inline").addEventListener("click", () => {
    document.getElementById("add-env-form-container").style.display = "none";
    document.getElementById("add-env-inline-form").reset();
  });

  document.getElementById("add-env-inline-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const projectSelect = document.getElementById("env-project");
    const formData = {
      projectId: projectSelect.value,
      key: document.getElementById("env-key-inline").value,
      value: document.getElementById("env-value-inline").value,
      type: document.getElementById("env-type-inline").value,
      environment: document.getElementById("env-environment").value,
    };
    addEnvVarFromForm(formData).then(() => {
      document.getElementById("add-env-form-container").style.display = "none";
      document.getElementById("add-env-inline-form").reset();
    });
  });

  // Env project/environment change
  document.getElementById("env-project").addEventListener("change", loadEnvVars);
  document.getElementById("env-environment").addEventListener("change", loadEnvVars);

  // Deploy project form (in project detail view)
  document.getElementById("deploy-project-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("deploy-zip");
    const file = fileInput.files[0];
    if (!file) {
      showToast("Please select a ZIP file", "error");
      return;
    }
    const formData = new FormData();
    formData.append("zip", file);
    try {
      showToast("Deploying...", "info");
      const res = await fetch(`${API_BASE}/projects/${currentProjectId}/deployments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Deployment failed");
      }
      showToast("Deployment created", "success");
      fileInput.value = "";
      loadProjectDeployments(currentProjectId);
      loadProjects();
      loadOverview();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // GitHub connect
  document.getElementById("github-connect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repoUrl = document.getElementById("github-repo-url").value;
    const branch = document.getElementById("github-branch").value;
    const token = document.getElementById("github-token").value;

    if (!repoUrl || !token) {
      showToast("Repository URL and token are required", "error");
      return;
    }

    try {
      showToast("Connecting to GitHub...", "info");
      const result = await api(`/projects/${currentProjectId}/github/connect`, {
        method: "POST",
        body: JSON.stringify({ repoUrl, token, branch }),
      });
      document.getElementById("github-connect-form").style.display = "none";
      document.getElementById("github-connected").style.display = "block";
      document.getElementById("github-repo-display").textContent = repoUrl;
      document.getElementById("github-branch-display").textContent = branch;
      showToast("GitHub connected", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Sync GitHub commits
  window.syncGitHubCommits = async () => {
    if (!currentProjectId) return;
    try {
      showToast("Syncing commits...", "info");
      const result = await api(`/projects/${currentProjectId}/github/sync`, {
        method: "POST",
      });
      const ts = result.project?.github_last_synced_at
        ? new Date(result.project.github_last_synced_at).toLocaleString()
        : "Just now";
      document.getElementById("github-synced-display").textContent = ts;
      loadCommits(currentProjectId);
      showToast(`Synced ${result.count} commits`, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Disconnect GitHub
  window.disconnectGitHub = async () => {
    if (!currentProjectId) return;
    try {
      await api(`/projects/${currentProjectId}/github/disconnect`, {
        method: "DELETE",
      });
      document.getElementById("github-connected").style.display = "none";
      document.getElementById("github-connect-form").style.display = "block";
      document.getElementById("github-connect-form").querySelectorAll("input").forEach((i) => (i.value = ""));
      document.getElementById("commits-list-wrap").style.display = "none";
      document.getElementById("commits-empty").style.display = "block";
      showToast("GitHub disconnected", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Load commits
  window.loadCommits = async (projectId) => {
    const tbody = document.getElementById("commits-table-body");
    const empty = document.getElementById("commits-empty");
    const wrap = document.getElementById("commits-list-wrap");
    try {
      const data = await api(`/projects/${projectId}/github/commits?limit=50`);
      if (!data.commits || data.commits.length === 0) {
        wrap.style.display = "none";
        empty.style.display = "block";
        return;
      }
      empty.style.display = "none";
      wrap.style.display = "block";
      tbody.innerHTML = data.commits
        .map(
          (c) => `
          <tr>
            <td><code>${c.sha.slice(0, 7)}</code></td>
            <td>${escapeHtml(c.message)}</td>
            <td>${escapeHtml(c.authorName)}</td>
            <td>${c.authorDate ? new Date(c.authorDate).toLocaleString() : "-"}</td>
            <td>
              <a href="${c.htmlUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">View on GitHub</a>
            </td>
          </tr>
        `
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  };

  // Also load commits when viewing project
  const origViewProject = window.viewProject;
  window.viewProject = (id) => {
    origViewProject(id);
    setTimeout(() => {
      // Check if GitHub is connected
      api(`/projects/${id}`).then((p) => {
        if (p.github_repo_url) {
          document.getElementById("github-connect-form").style.display = "none";
          document.getElementById("github-connected").style.display = "block";
          document.getElementById("github-repo-display").textContent = p.github_repo_url;
          document.getElementById("github-branch-display").textContent = p.github_branch || "main";
          document.getElementById("github-synced-display").textContent = p.github_last_synced_at
            ? new Date(p.github_last_synced_at).toLocaleString()
            : "Never";
          loadCommits(id);
        }
      }).catch(() => {});
    }, 100);
  };

  // Modal close on overlay click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });

  // Initial load
  loadOverview();
  populateProjectSelects();
});

// ---------- Global functions (used by inline onclick) ----------
function loadProjectDeployments(projectId) {
  const tbody = document.getElementById("project-deployments-table-body");
  if (!tbody) {
    const alt = document.getElementById("project-deployments-tbody");
    if (!alt) return;
    return loadProjectDeploymentsInto(alt, projectId);
  }
  loadProjectDeploymentsInto(tbody, projectId);
}

function loadProjectDeploymentsInto(tbody, projectId) {
  tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  api(`/projects/${projectId}/deployments`)
    .then((data) => {
      if (!data.deployments || data.deployments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No deployments yet</td></tr>';
        return;
      }
      tbody.innerHTML = "";
      for (const d of data.deployments) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.version || "-"}</td>
          <td>${escapeHtml(d.status)}</td>
          <td>${d.build_duration_ms ? formatDuration(d.build_duration_ms) : "-"}</td>
          <td>${d.file_count || 0}</td>
          <td>${d.created_at ? formatDate(d.created_at) : "-"}</td>
          <td>
            <button class="btn btn-sm" onclick="viewDeployment('${d.id}')">View</button>
            ${d.status === "ready" ? `<button class="btn btn-sm" onclick="rollbackDeployment('${d.id}')">Rollback</button>` : ""}
          </td>
        `;
        tbody.appendChild(tr);
      }
    })
    .catch((e) => {
      tbody.innerHTML = `<tr><td colspan="6" style="color:red">Error: ${escapeHtml(e.message)}</td></tr>`;
    });
}

function viewProject(id) {
  const project = projects.find(p => p.id === id);
  if (!project) {
    showToast("Project not found", "error");
    return;
  }

  currentProjectId = id;
  document.getElementById("projects-list").style.display = "none";
  document.getElementById("projects-empty").style.display = "none";
  document.getElementById("project-detail").style.display = "block";
  document.getElementById("create-project-form-container").style.display = "none";
  document.getElementById("import-git-form-container").style.display = "none";
  document.getElementById("show-create-project-form").style.display = "none";
  document.getElementById("show-import-git-form").style.display = "none";

  document.getElementById("project-detail-name").textContent = project.name;
  document.getElementById("project-detail-description").textContent = project.description || "No description";

  loadProjectDeployments(id);
}

window.viewDeployment = viewDeployment;
window.rollbackDeployment = rollbackDeployment;
window.deleteProject = deleteProject;
window.viewProject = viewProject;
window.deleteDomain = deleteDomain;
window.verifyDomain = verifyDomain;
window.deleteEnvVar = deleteEnvVar;
