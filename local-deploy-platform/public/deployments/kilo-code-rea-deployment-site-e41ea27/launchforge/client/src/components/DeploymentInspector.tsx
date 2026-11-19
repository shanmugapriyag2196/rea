import React, { useState } from 'react'
import { useToast } from './ToastProvider'
import { X, ExternalLink, Copy, Check, Rocket, Globe, FileText, Terminal, Layout, Cpu, Settings, User, LogOut, ChevronDown, Activity, Zap, Shield, BarChart3, Eye, Search, Bell, Command, Trash2, Plus, AlertCircle, Info } from 'lucide-react'
import { TerminalLog } from './TerminalLog'

interface Props {
  open: boolean
  project: any
  deployment: any
  onClose: () => void
  onRedeploy: (id: string) => void
}

export function DeploymentInspector({ open, project, deployment, onClose, onRedeploy }: Props) {
  const { addToast } = useToast()
  const [copied, setCopied] = useState(false)

  if (!open || !project) return null

  const previewUrl = `http://127.0.0.1:3001/api/preview/${deployment?.id}/`

  const handleCopy = () => {
    navigator.clipboard.writeText(previewUrl)
    setCopied(true)
    addToast('URL copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    ready: { label: 'Ready', color: 'text-[#00ff88]', bg: 'bg-[#00ff88]/10 border-[#00ff88]/20' },
    building: { label: 'Building', color: 'text-[#ffb020]', bg: 'bg-[#ffb020]/10 border-[#ffb020]/20' },
    failed: { label: 'Error', color: 'text-[#ff3b3b]', bg: 'bg-[#ff3b3b]/10 border-[#ff3b3b]/20' },
    queued: { label: 'Queued', color: 'text-[#00a3ff]', bg: 'bg-[#00a3ff]/10 border-[#00a3ff]/20' },
    canceled: { label: 'Canceled', color: 'text-[#888888]', bg: 'bg-[#888888]/10 border-[#888888]/20' },
  }
  const sc = statusConfig[deployment?.status] || statusConfig.queued

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-[#0a0a0a] border-l border-[#222222] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[#888888]" />
            <h2 className="text-base font-semibold text-white">Deployment</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#1a1a1a] text-[#888888] hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{project.name}</h3>
            <span className="text-xs text-[#555555]">{project.framework || 'unknown'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`badge ${sc.bg} ${sc.color}`}>{sc.label}</span>
            {deployment?.durationMs && (
              <span className="text-xs text-[#555555]">{(deployment.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#888888] mb-1.5">Preview URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-[#888888] bg-[#111111] border border-[#222222] rounded-md px-3 py-2 truncate font-mono">
                {previewUrl}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded-md bg-[#111111] border border-[#222222] text-[#888888] hover:text-white transition"
              >
                {copied ? <Check size={14} className="text-[#00ff88]" /> : <Copy size={14} />}
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-md bg-[#111111] border border-[#222222] text-[#888888] hover:text-white transition"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#111111] border border-[#222222] rounded-md p-3">
              <span className="text-xs text-[#555555]">Commit</span>
              <code className="text-xs text-white font-mono mt-1 block">{deployment?.commitSha || 'local'}</code>
            </div>
            <div className="bg-[#111111] border border-[#222222] rounded-md p-3">
              <span className="text-xs text-[#555555]">Branch</span>
              <code className="text-xs text-white font-mono mt-1 block">{deployment?.branch || 'main'}</code>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#888888] mb-1.5">Build Logs</label>
            <TerminalLog logs={deployment?.logs || ''} status={deployment?.status || 'queued'} />
          </div>
        </div>

        <div className="p-4 border-t border-[#222222] flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
          >
            Close
          </button>
          <button
            onClick={() => onRedeploy(project.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
          >
            <Rocket size={14} /> Redeploy
          </button>
        </div>
      </div>
    </div>
  )
}