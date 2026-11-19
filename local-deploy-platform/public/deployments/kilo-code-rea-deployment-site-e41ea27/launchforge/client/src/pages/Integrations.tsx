import React from 'react'
import { Plug, GitFork, Globe, Database, Mail, Cloud, Zap, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { useToast } from '../components/ToastProvider'

// No external integrations are connected. This is a local-only application.
const INTEGRATIONS = [
  { key: 'github', name: 'GitHub', desc: 'Import and deploy public repositories', icon: GitFork, available: true },
  { key: 'gitlab', name: 'GitLab', desc: 'Import and deploy GitLab repositories', icon: GitFork, available: false },
  { key: 'vercel', name: 'Vercel', desc: 'Import existing Vercel deployments', icon: Cloud, available: false },
  { key: 'database', name: 'Database', desc: 'Local SQLite storage', icon: Database, available: true, connected: true },
  { key: 'email', name: 'Email', desc: 'Send notifications via SMTP', icon: Mail, available: false },
  { key: 'webhooks', name: 'Webhooks', desc: 'Receive deployment events', icon: Zap, available: true },
]

export default function Integrations() {
  const { addToast } = useToast()

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Integrations</h2>
        <p className="text-sm text-[#888888] mt-1">Connect external services and tools</p>
      </div>

      <div className="card p-4 mb-6 border-[#ffb020]/20 bg-[#ffb020]/5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-[#ffb020] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Local-only mode</h4>
            <p className="text-xs text-[#888888] leading-relaxed">
              VG Deployment App runs locally. Only integrations that work offline are available. No data is sent to external services without explicit authorization.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.key} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-md bg-[#111111] border border-[#222222] flex items-center justify-center">
                    <Icon size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{item.name}</h3>
                    <p className="text-xs text-[#888888] mt-0.5">{item.desc}</p>
                  </div>
                </div>
                {item.connected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[#00ff88]">
                    <Check size={12} /> Connected
                  </span>
                ) : !item.available ? (
                  <span className="text-xs text-[#555555]">Unavailable</span>
                ) : (
                  <span className="text-xs text-[#555555]">Not connected</span>
                )}
              </div>
              {item.available && !item.connected && (
                <button
                  onClick={() => addToast(item.name + ' integration not yet configured', 'info')}
                  className="px-3 py-1.5 text-xs bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
                >
                  Configure
                </button>
              )}
              {item.key === 'github' && (
                <button
                  onClick={() => addToast('GitHub import is available from the Templates page', 'info')}
                  className="px-3 py-1.5 text-xs bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition font-medium flex items-center gap-1.5"
                >
                  <ExternalLink size={12} /> Use GitHub import
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}