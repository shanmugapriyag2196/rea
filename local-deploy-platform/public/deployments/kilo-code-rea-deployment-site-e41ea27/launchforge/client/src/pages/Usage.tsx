import React from 'react'
import { Cpu, HardDrive, Activity, Zap, Clock, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDuration, formatBytes } from '../lib/utils'

// TODO: wire api.get('/usage') to the query below
export default function Usage() {
  const { data, isLoading } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get('/usage'),
  })

  const u = data || {}

  const Stat = ({ label, value, icon: Icon, color }: any) => (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#888888] uppercase tracking-wider">{label}</span>
        <Icon size={16} className={color || 'text-white'} />
      </div>
      <div className="text-2xl font-bold text-white">{value ?? '—'}</div>
    </div>
  )

  if (isLoading) return <div className="text-[#555555] text-sm py-8 text-center">Loading usage...</div>

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Usage & Billing</h2>
        <p className="text-sm text-[#888888] mt-0.5">Resource utilization and build statistics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Build Minutes" value={u.buildMinutes ?? 0} icon={Clock} color="text-[#ffb020]" />
        <Stat label="Bandwidth" value={formatBytes(u.bandwidthBytes ?? 0)} icon={TrendingUp} color="text-[#00a3ff]" />
        <Stat label="Edge Functions" value={u.edgeInvocations ?? 0} icon={Zap} color="text-[#00ff88]" />
        <Stat label="Deployments" value={u.totalDeployments ?? 0} icon={Activity} color="text-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <HardDrive size={16} /> Storage
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Deployments', used: u.deploymentsStorage ?? 0, total: 10 * 1024 * 1024 * 1024 },
              { label: 'Build Cache', used: u.cacheStorage ?? 0, total: 5 * 1024 * 1024 * 1024 },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#888888]">{row.label}</span>
                  <span className="text-[#555555]">
                    {formatBytes(row.used)} / {formatBytes(row.total)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div
                    className="h-full bg-white transition-all"
                    style={{ width: `${Math.min(100, (row.used / row.total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Cpu size={16} /> Build Runtime by Framework
          </h3>
          <div className="space-y-3">
            {(u.frameworkBreakdown || [
              { framework: 'static', minutes: 0 },
              { framework: 'vite', minutes: 0 },
              { framework: 'next', minutes: 0 },
              { framework: 'node', minutes: 0 },
            ]).map((f: any) => (
              <div key={f.framework} className="flex items-center justify-between text-sm">
                <span className="text-[#888888] capitalize">{f.framework}</span>
                <span className="text-white font-mono">{f.minutes} min</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}