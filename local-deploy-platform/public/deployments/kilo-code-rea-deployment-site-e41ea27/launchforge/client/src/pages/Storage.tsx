import React from 'react'
import { HardDrive, Database, Cpu, FileText, Plus, Trash2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useToast } from '../components/ToastProvider'

// Local-only storage. No external services are connected.
export default function Storage() {
  const { addToast } = useToast()

  const StorageCard = ({ title, desc, icon: Icon, used, total, unit }: any) => {
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
    return (
      <div className="card p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-[#111111] border border-[#222222] flex items-center justify-center">
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">{title}</h3>
              <p className="text-xs text-[#888888] mt-0.5">{desc}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#888888]">Used</span>
            <span className="text-white font-mono">{used} {unit}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
            <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#888888]">Capacity</span>
            <span className="text-[#555555] font-mono">{total} {unit}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Storage</h2>
        <p className="text-sm text-[#888888] mt-1">Local storage configuration and usage</p>
      </div>

      <div className="card p-4 mb-6 border-[#ffb020]/20 bg-[#ffb020]/5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-[#ffb020] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Local-only storage</h4>
            <p className="text-xs text-[#888888] leading-relaxed">
              VG Deployment App stores all data locally on this machine. No external storage services (Vercel Postgres, Blob, KV) are configured or connected. All data stays on 127.0.0.1.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StorageCard title="Database" desc="SQLite deployment records" icon={Database} used={0} total={1} unit="GB" />
        <StorageCard title="Deployments" desc="Built output files" icon={HardDrive} used={0} total={10} unit="GB" />
        <StorageCard title="Build Cache" desc="Cached build artifacts" icon={Cpu} used={0} total={5} unit="GB" />
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#222222] flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Storage locations</h3>
            <p className="text-xs text-[#888888]">Where data is stored on this machine</p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { label: 'Database file', path: './data/vg-deployment.db' },
            { label: 'Deployment output', path: './deployments/' },
            { label: 'Build cache', path: './cache/' },
            { label: 'Temporary archives', path: './tmp/' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between p-3 rounded-lg bg-[#111111]">
              <span className="text-sm text-white font-medium">{row.label}</span>
              <code className="text-xs text-[#888888] font-mono">{row.path}</code>
            </div>
          ))}
        </div>
        <button
          onClick={() => addToast('Storage is local-only — nothing to export', 'info')}
          className="mt-4 px-3 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
        >
          View storage info
        </button>
      </div>
    </div>
  )
}