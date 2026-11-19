import React, { useState } from 'react'
import { useToast } from './ToastProvider'
import { FolderOpen, Plus, Search, Trash2, Rocket, Layout, Eye, Copy, Check, ExternalLink, Settings, Globe, FileText, Terminal, X } from 'lucide-react'

interface ProjectCardProps {
  project: any
  onDeploy: (id: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onOpenSettings: (id: string) => void
}

const FRAMEWORK_ICONS: Record<string, string> = {
  static: '🌐',
  vite: '⚡',
  next: '▲',
  react: '🔴',
  preact: '🟢',
  svelte: '🔥',
  astro: '✨',
  node: '🟢',
  unknown: '📦',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ready: { label: 'Ready', color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/10 border-[#00ff88]/20' },
  building: { label: 'Building', color: 'text-[#ffb020]', bg: 'bg-[#ffb020]/10 border-[#ffb020]/20' },
  failed: { label: 'Error', color: 'text-[#ff3b3b]', bg: 'bg-[#ff3b3b]/10 border-[#ff3b3b]/20' },
  queued: { label: 'Queued', color: 'text-[#00a3ff]', bg: 'bg-[#00a3ff]/10 border-[#00a3ff]/20' },
  canceled: { label: 'Canceled', color: 'text-[#888888]', bg: 'bg-[#888888]/10 border-[#888888]/20' },
}

export function ProjectCard({ project, onDeploy, onOpen, onDelete, onOpenSettings }: ProjectCardProps) {
  const { addToast } = useToast()
  const [copied, setCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const framework = project.framework || 'unknown'
  const icon = FRAMEWORK_ICONS[framework] || '📦'
  const status = project.latestDeployment?.status || 'ready'
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.ready

  const handleCopyUrl = () => {
    const url = `http://127.0.0.1:3001/api/preview/${project.latestDeployment?.id}/`
    navigator.clipboard.writeText(url)
    setCopied(true)
    addToast('URL copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="card p-4 hover:border-[#333333] transition-all duration-150 cursor-pointer group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onOpen(project.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <div>
            <h3 className="font-semibold text-sm text-white truncate max-w-[180px]">{project.name}</h3>
            <span className="text-xs text-[#555555]">{framework}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${statusConfig.bg} ${statusConfig.color}`}>{statusConfig.label}</span>
          {showActions && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); onDeploy(project.id) }}
                className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition"
                title="Redeploy"
              >
                <Rocket size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenSettings(project.id) }}
                className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition"
                title="Settings"
              >
                <Settings size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
                className="p-1.5 rounded hover:bg-[#ff3b3b]/10 text-[#888888] hover:text-[#ff3b3b] transition"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#555555]">
        <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        {project.latestDeployment?.durationMs && (
          <span>{(project.latestDeployment.durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>

      {project.latestDeployment?.previewPath && (
        <div className="mt-3 pt-3 border-t border-[#1a1a1a] flex items-center gap-2">
          <code className="flex-1 text-xs text-[#888888] bg-[#0a0a0a] px-2 py-1 rounded truncate">
            localhost:3001
          </code>
          <button
            onClick={(e) => { e.stopPropagation(); handleCopyUrl() }}
            className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition"
          >
            {copied ? <Check size={12} className="text-[#00ff88]" /> : <Copy size={12} />}
          </button>
          <a
            href={`http://127.0.0.1:3001/api/preview/${project.latestDeployment.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  )
}