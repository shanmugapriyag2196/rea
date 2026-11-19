import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  FolderGit2, 
  Rocket, 
  Activity, 
  Search, 
  Plus, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ExternalLink,
  Globe,
  Terminal
} from 'lucide-react'
import { Project, Deployment, Analytics } from '../types'

// Mock initial data matching your types.ts interfaces
const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'e-commerce-storefront',
    slug: 'e-commerce-storefront',
    framework: 'Next.js',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDir: '.next',
    rootDir: null,
    repoPath: 'github.com/user/e-commerce-storefront',
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 120000,
    settings: {},
    latestDeployment: {
      id: 'd1',
      projectId: 'p1',
      status: 'ready',
      buildCommand: 'npm run build',
      outputDir: '.next',
      source: 'git',
      logs: 'Build completed successfully in 42s',
      exitCode: 0,
      durationMs: 42000,
      createdAt: Date.now() - 120000,
      updatedAt: Date.now() - 120000,
      previewPath: 'e-commerce-storefront.launchforge.app',
      branch: 'main',
      commitSha: 'a1b2c3d'
    }
  },
  {
    id: 'p2',
    name: 'marketing-landing-page',
    slug: 'marketing-landing-page',
    framework: 'Vite',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDir: 'dist',
    rootDir: null,
    repoPath: 'github.com/user/marketing-landing',
    createdAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 10800000,
    settings: {},
    latestDeployment: {
      id: 'd2',
      projectId: 'p2',
      status: 'ready',
      buildCommand: 'npm run build',
      outputDir: 'dist',
      source: 'git',
      logs: 'Built in 18s',
      exitCode: 0,
      durationMs: 18000,
      createdAt: Date.now() - 10800000,
      updatedAt: Date.now() - 10800000,
      previewPath: 'landing-page.launchforge.app',
      branch: 'main',
      commitSha: 'e5f6g7h'
    }
  },
  {
    id: 'p3',
    name: 'saas-dashboard-api',
    slug: 'saas-dashboard-api',
    framework: 'Node.js',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDir: 'build',
    rootDir: null,
    repoPath: 'github.com/user/saas-api',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 3600000,
    settings: {},
    latestDeployment: {
      id: 'd3',
      projectId: 'p3',
      status: 'building',
      buildCommand: 'npm run build',
      outputDir: 'build',
      source: 'git',
      logs: 'Bundling serverless modules...',
      exitCode: null,
      durationMs: null,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      previewPath: 'saas-api.launchforge.app',
      branch: 'feat/auth',
      commitSha: 'i9j0k1l'
    }
  },
  {
    id: 'p4',
    name: 'docs-portal',
    slug: 'docs-portal',
    framework: 'Astro',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    outputDir: 'dist',
    rootDir: null,
    repoPath: 'github.com/user/docs-portal',
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000,
    settings: {},
    latestDeployment: {
      id: 'd4',
      projectId: 'p4',
      status: 'failed',
      buildCommand: 'npm run build',
      outputDir: 'dist',
      source: 'git',
      logs: 'Error: Module not found: Error: Can\'t resolve \'./missing-config\'',
      exitCode: 1,
      durationMs: 12000,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      previewPath: null,
      branch: 'main',
      commitSha: 'm2n3o4p'
    }
  }
]

export default function Overview() {
  const [searchQuery, setSearchQuery] = useState('')
  const [projects] = useState<Project[]>(MOCK_PROJECTS)

  // Filter projects based on search query
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.framework && p.framework.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Status Badge Helper
  const renderStatusBadge = (status?: Deployment['status']) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 font-medium">
            <CheckCircle2 size={12} /> Ready
          </span>
        )
      case 'building':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-950/40 border border-amber-800/50 text-amber-400 font-medium">
            <Clock size={12} className="animate-spin" /> Building
          </span>
        )
      case 'failed':
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-rose-950/40 border border-rose-800/50 text-rose-400 font-medium">
            <AlertCircle size={12} /> Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-neutral-900 border border-[#222] text-[#888]">
            No Deployments
          </span>
        )
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6 text-[#ededed]">
      
      {/* 1. TOP STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0a0a0a] border border-[#222] p-5 rounded-xl space-y-1">
          <p className="text-xs text-[#888] font-medium">Total Projects</p>
          <p className="text-2xl font-semibold text-white">{projects.length}</p>
        </div>

        <div className="bg-[#0a0a0a] border border-[#222] p-5 rounded-xl space-y-1">
          <p className="text-xs text-[#888] font-medium">Active Deployments</p>
          <p className="text-2xl font-semibold text-white">
            {projects.filter(p => p.latestDeployment?.status === 'ready').length}
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-[#222] p-5 rounded-xl space-y-1">
          <p className="text-xs text-[#888] font-medium">Total Bandwidth</p>
          <p className="text-2xl font-semibold text-white">1.42 GB</p>
        </div>

        <div className="bg-[#0a0a0a] border border-[#222] p-5 rounded-xl space-y-1">
          <p className="text-xs text-[#888] font-medium">System Health</p>
          <p className="text-2xl font-semibold text-emerald-400 flex items-center gap-2">
            99.9% <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-normal">Optimal</span>
          </p>
        </div>
      </div>

      {/* 2. PROJECTS SECTION HEADER & SEARCH */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">Projects</h3>
            <p className="text-xs text-[#888]">Your active local deployment instances and repositories.</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-[#888] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search projects or frameworks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none focus:border-neutral-600 transition"
              />
            </div>

            <Link
              to="/projects/new"
              className="flex items-center gap-1.5 bg-white text-black text-xs font-medium px-3.5 py-1.5 rounded-lg hover:bg-neutral-200 transition shadow-sm whitespace-nowrap"
            >
              <Plus size={14} /> Add New
            </Link>
          </div>
        </div>

        {/* PROJECTS GRID */}
        {filteredProjects.length === 0 ? (
          <div className="bg-[#0a0a0a] border border-[#222] rounded-xl p-8 text-center space-y-3">
            <FolderGit2 className="w-8 h-8 text-[#555] mx-auto" />
            <p className="text-sm text-[#888]">No projects found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((project) => {
              const dep = project.latestDeployment
              return (
                <div
                  key={project.id}
                  className="group bg-[#0a0a0a] border border-[#222] rounded-xl p-5 hover:border-neutral-700 transition flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Link 
                        to={`/projects/${project.id}`}
                        className="font-semibold text-sm text-white group-hover:text-indigo-400 transition flex items-center gap-2"
                      >
                        {project.name}
                      </Link>
                      {dep?.previewPath ? (
                        <a
                          href={`https://${dep.previewPath}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#888] hover:text-white transition flex items-center gap-1"
                        >
                          {dep.previewPath} <ExternalLink size={10} />
                        </a>
                      ) : (
                        <p className="text-xs text-[#555]">No active URL</p>
                      )}
                    </div>

                    {renderStatusBadge(dep?.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#888] pt-3 border-t border-[#1a1a1a]">
                    <div className="flex items-center gap-3">
                      <span className="bg-[#141414] border border-[#222] px-2 py-0.5 rounded text-[11px] text-[#aaa]">
                        {project.framework || 'Custom'}
                      </span>
                      {dep?.branch && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <FolderGit2 size={12} /> {dep.branch}
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/projects/${project.id}`}
                      className="text-white opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 text-[11px] font-medium"
                    >
                      Inspect <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. RECENT ACTIVITY AUDIT STREAM */}
      <div className="space-y-4 pt-2">
        <h3 className="text-base font-semibold text-white tracking-tight">Recent Activity</h3>
        <div className="bg-[#0a0a0a] border border-[#222] rounded-xl divide-y divide-[#1a1a1a] overflow-hidden">
          {projects.map((p) => {
            const dep = p.latestDeployment
            if (!dep) return null
            return (
              <div key={dep.id} className="p-4 flex items-center justify-between text-xs hover:bg-[#111]/60 transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#222] flex items-center justify-center text-[#888]">
                    <Rocket size={14} />
                  </div>
                  <div>
                    <p className="font-medium text-white flex items-center gap-2">
                      {p.name}
                      <span className="text-[10px] text-[#666] font-mono">({dep.commitSha})</span>
                    </p>
                    <p className="text-[#888] text-[11px] mt-0.5">{dep.logs}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[#888]">
                  <span className="text-[11px] font-mono">{dep.durationMs ? `${dep.durationMs / 1000}s` : '--'}</span>
                  {renderStatusBadge(dep.status)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}