"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  ChevronDown,
  Command,
  Database,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  LayoutGrid,
  Plug,
  Plus,
  Search,
  Settings,
} from "lucide-react";

type Deployment = {
  id: string;
  projectId?: string;
  projectName?: string;
  status?: string;
  created_at?: number | string;
  duration?: number;
  commit?: string;
  branch?: string;
  url?: string;
};

type Project = {
  id: string;
  name: string;
  framework?: string;
  created_at?: number | string;
  github_repo_url?: string;
};

const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) ||
  "http://127.0.0.1:3456/api";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "projects", label: "Projects", icon: Boxes },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "storage", label: "Storage", icon: Database },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "observability", label: "Observability", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatRelative(ts?: number | string) {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDuration(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function normalizeStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (s === "ready" || s === "success" || s === "completed") return "Ready";
  if (s === "building" || s === "queued" || s === "pending" || s === "in_progress") return "Building";
  if (s === "error" || s === "failed" || s === "canceled") return "Failed";
  return status || "—";
}

function StatusBadge({ status }: { status?: string }) {
  const label = normalizeStatus(status);
  const tone =
    label === "Ready"
      ? { dot: "bg-emerald-500", text: "text-emerald-400", ring: "bg-emerald-500/10" }
      : label === "Building"
        ? { dot: "bg-amber-400 animate-pulse-dot", text: "text-amber-300", ring: "bg-amber-500/10" }
        : label === "Failed"
          ? { dot: "bg-rose-500", text: "text-rose-400", ring: "bg-rose-500/10" }
          : { dot: "bg-[#666]", text: "text-[#888]", ring: "bg-white/5" };
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium", tone.ring, tone.text)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}

function GlowDot({ color }: { color: "emerald" | "rose" }) {
  const cls =
    color === "emerald"
      ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
      : "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)]";
  return <span className={cx("inline-block h-2 w-2 rounded-full", cls)} aria-hidden />;
}

function MetricCard({
  label,
  value,
  glow,
}: {
  label: string;
  value: number | string;
  glow?: "emerald" | "rose";
}) {
  return (
    <div className="rounded-lg border border-[#222222] bg-[#0A0A0A] p-5 transition-colors hover:border-[#444444] hover:bg-[#111111]">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[#888888]">{label}</div>
      <div className="mt-3 flex items-center gap-3">
        {glow ? <GlowDot color={glow} /> : null}
        <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
      </div>
    </div>
  );
}

function StyledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-[#222222] bg-black py-2 pl-3 pr-9 text-sm text-white outline-none transition-colors hover:border-[#444444] focus:border-[#444444]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0A0A0A] text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-[#888888]" />
    </label>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#333333] bg-[#050505] px-6 py-14 text-center">
      <div className="rounded-full border border-[#222222] bg-[#0A0A0A] p-3 text-[#888888]">
        <Boxes className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-white">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[#888888]">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const updateIndicator = useCallback((id: TabId | null) => {
    const targetId = id ?? activeTab;
    const container = tabsRef.current;
    const el = tabRefs.current[targetId];
    if (!container || !el) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setIndicator({ left: r.left - c.left, width: r.width });
  }, [activeTab]);

  useEffect(() => {
    updateIndicator(hoveredTab);
  }, [hoveredTab, activeTab, updateIndicator]);

  useEffect(() => {
    const onResize = () => updateIndicator(hoveredTab);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hoveredTab, updateIndicator]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const pRes = await fetch(`${API_BASE}/projects`, { cache: "no-store" });
        const pJson = await pRes.json().catch(() => ({}));
        const pList: Project[] = Array.isArray(pJson) ? pJson : pJson.projects || [];
        if (cancelled) return;
        setProjects(pList);

        const all: Deployment[] = [];
        for (const p of pList) {
          try {
            const dRes = await fetch(`${API_BASE}/projects/${p.id}/deployments`, { cache: "no-store" });
            const dJson = await dRes.json().catch(() => ({}));
            const list: Deployment[] = Array.isArray(dJson) ? dJson : dJson.deployments || [];
            list.forEach((d) => all.push({ ...d, projectName: d.projectName || p.name, projectId: p.id }));
          } catch {
            /* per-project fetch failure is non-fatal */
          }
        }
        all.sort((a, b) => {
          const ta = typeof a.created_at === "number" ? a.created_at : Date.parse(String(a.created_at || 0));
          const tb = typeof b.created_at === "number" ? b.created_at : Date.parse(String(b.created_at || 0));
          return (tb || 0) - (ta || 0);
        });
        if (!cancelled) setDeployments(all);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const ready = deployments.filter((d) => normalizeStatus(d.status) === "Ready").length;
    const failed = deployments.filter((d) => normalizeStatus(d.status) === "Failed").length;
    return { projects: projects.length, deployments: deployments.length, ready, failed };
  }, [projects, deployments]);

  const filteredDeployments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deployments.filter((d) => {
      const matchesSearch =
        !q ||
        (d.projectName || "").toLowerCase().includes(q) ||
        (d.commit || "").toLowerCase().includes(q) ||
        (d.id || "").toLowerCase().includes(q);
      const matchesProject = projectFilter === "all" || d.projectId === projectFilter || d.projectName === projectFilter;
      const s = normalizeStatus(d.status);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "ready" && s === "Ready") ||
        (statusFilter === "building" && s === "Building") ||
        (statusFilter === "failed" && s === "Failed");
      return matchesSearch && matchesProject && matchesStatus;
    });
  }, [deployments, search, projectFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-[#222222] bg-black/95">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 76 65" fill="white" aria-hidden>
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
            </div>
            <span className="text-[#333]">/</span>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-[#222222] bg-[#0A0A0A] px-3 py-1.5 text-sm text-[#ededed] transition-colors hover:border-[#444444] hover:bg-[#111111]"
            >
              <span className="max-w-[180px] truncate">Personal Account</span>
              <ChevronDown className="h-4 w-4 text-[#888888]" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="hidden items-center gap-2 rounded-md border border-[#222222] bg-[#0A0A0A] px-3 py-1.5 text-sm text-[#888888] transition-colors hover:border-[#444444] hover:text-white md:flex"
            >
              <Search className="h-4 w-4" />
              <span>Search...</span>
              <span className="ml-3 inline-flex items-center gap-1 rounded border border-[#333] bg-black px-1.5 py-0.5 text-[11px] text-[#888888]">
                <Command className="h-3 w-3" />K
              </span>
            </button>
            <button
              type="button"
              className="rounded-md border border-[#222222] bg-[#0A0A0A] p-2 text-[#888888] transition-colors hover:border-[#444444] hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#CCCCCC]"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
            <button
              type="button"
              className="h-8 w-8 rounded-full bg-gradient-to-br from-[#333] to-[#111] ring-1 ring-[#333]"
              aria-label="User menu"
            />
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] px-6">
          <div
            ref={tabsRef}
            className="relative flex gap-1 overflow-x-auto"
            onMouseLeave={() => setHoveredTab(null)}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => setHoveredTab(tab.id)}
                  className={cx(
                    "relative whitespace-nowrap px-3 py-3 text-sm transition-colors",
                    active ? "text-white" : "text-[#888888] hover:text-white",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
            {indicator ? (
              <span
                className="pointer-events-none absolute bottom-0 h-px bg-white transition-[left,width] duration-200 ease-out"
                style={{ left: indicator.left, width: indicator.width }}
              />
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        {activeTab !== "overview" && activeTab !== "projects" ? (
          <div className="rounded-lg border border-dashed border-[#333333] bg-[#050505] p-10 text-center">
            <h2 className="text-lg font-semibold text-white">{TABS.find((t) => t.id === activeTab)?.label}</h2>
            <p className="mt-2 text-sm text-[#888888]">
              This section is wired for the local VG Deployment backend. Configure it in Settings or via the local platform.
            </p>
            {error ? <p className="mt-3 text-sm text-rose-400">Backend: {error}</p> : null}
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-white">Overview</h1>
              <p className="mt-1 text-sm text-[#888888]">
                Projects and deployments from the local platform{API_BASE ? ` (${API_BASE})` : ""}.
              </p>
              {error ? (
                <p className="mt-2 text-sm text-rose-400">
                  Could not reach backend. Start `local-deploy-platform` on 127.0.0.1:3456 to load live data.
                </p>
              ) : null}
            </div>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Projects" value={loading ? "—" : metrics.projects} />
              <MetricCard label="Total Deployments" value={loading ? "—" : metrics.deployments} />
              <MetricCard label="Ready" value={loading ? "—" : metrics.ready} glow="emerald" />
              <MetricCard label="Failed" value={loading ? "—" : metrics.failed} glow="rose" />
            </section>

            <section className="mt-10">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-white">Deployments</h2>
                <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-3xl lg:justify-end">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search projects and deployments..."
                      className="w-full rounded-md border border-[#222222] bg-black py-2 pl-9 pr-3 text-sm text-white placeholder:text-[#666] outline-none transition-colors hover:border-[#444444] focus:border-[#444444]"
                    />
                  </div>
                  <StyledSelect
                    label="Project"
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={[
                      { value: "all", label: "All Projects" },
                      ...projects.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                  <StyledSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: "all", label: "All Statuses" },
                      { value: "ready", label: "Ready" },
                      { value: "building", label: "Building" },
                      { value: "failed", label: "Failed" },
                    ]}
                  />
                </div>
              </div>

              {loading ? (
                <div className="rounded-lg border border-[#222222] bg-[#0A0A0A] p-8 text-sm text-[#888888]">Loading…</div>
              ) : projects.length === 0 && deployments.length === 0 ? (
                <EmptyState
                  title="No projects or deployments"
                  detail="Create or import a project in the local VG Deployment platform, then redeployments will appear here."
                />
              ) : filteredDeployments.length === 0 ? (
                <EmptyState
                  title="No matching deployments"
                  detail="Try adjusting your search or filters."
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-[#222222] bg-[#0A0A0A]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-black/40 text-[11px] font-medium uppercase tracking-wider text-[#888888]">
                        <tr>
                          <th className="px-4 py-3">Project</th>
                          <th className="px-4 py-3">Branch</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#111111]">
                        {filteredDeployments.map((d) => (
                          <tr key={d.id} className="transition-colors hover:bg-[#111111]">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#222222] bg-black text-[#888888]">
                                  <Boxes className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-white">{d.projectName || "—"}</div>
                                  <div className="truncate text-xs text-[#666] font-mono">{d.id.slice(0, 10)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#888888]">
                              <div className="inline-flex items-center gap-2">
                                <GitBranch className="h-3.5 w-3.5" />
                                <span>{d.branch || "main"}</span>
                                {d.commit ? (
                                  <span className="inline-flex items-center gap-1 text-[#666]">
                                    <GitCommitHorizontal className="h-3.5 w-3.5" />
                                    <span className="font-mono text-xs">{String(d.commit).slice(0, 7)}</span>
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={d.status} />
                            </td>
                            <td className="px-4 py-3 text-[#888888]">{formatDuration(d.duration)}</td>
                            <td className="px-4 py-3 text-[#888888]">{formatRelative(d.created_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                {d.url ? (
                                  <a
                                    href={d.url}
                                    className="rounded-md p-1.5 text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white"
                                    aria-label="Open deployment"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  className="rounded-md p-1.5 text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white"
                                  aria-label="Actions"
                                >
                                  <Ellipsis className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
