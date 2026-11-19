import React from 'react'
import { CreditCard, TrendingUp, Clock, Cpu, HardDrive, Activity, Check, AlertCircle, ArrowUpCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatBytes } from '../lib/utils'

// Billing shows actual local usage. No real payment processing exists.
export default function Billing() {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get('/usage'),
  })

  const u = usage || {}

  const Stat = ({ label, value, icon: Icon, color }: any) => (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#888888] uppercase tracking-wider">{label}</span>
        <Icon size={16} className={color || 'text-white'} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )

  if (isLoading) {
    return <div className="text-[#888888] text-sm py-8 text-center">Loading billing data...</div>
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Billing</h2>
        <p className="text-sm text-[#888888] mt-1">Usage summary and plan information</p>
      </div>

      <div className="card p-4 mb-6 border-[#00a3ff]/20 bg-[#00a3ff]/5">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-[#00a3ff] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Local-only billing</h4>
            <p className="text-xs text-[#888888] leading-relaxed">
              VG Deployment App runs locally. No real payment processing is implemented. No payments have been completed. Usage shown below is actual local data.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Current plan</h3>
            <p className="text-xs text-[#888888] mt-0.5">Free local plan</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-[#111111] border border-[#222222] text-[#888888]">
            Free
          </span>
        </div>
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#111111] text-[#555555] border border-[#222222] rounded-md cursor-not-allowed"
        >
          <ArrowUpCircle size={12} /> Upgrade plan (not available locally)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Build minutes" value={u.buildMinutes ?? 0} icon={Clock} color="text-[#ffb020]" />
        <Stat label="Bandwidth" value={formatBytes(u.bandwidthBytes ?? 0)} icon={TrendingUp} color="text-[#00a3ff]" />
        <Stat label="Edge functions" value={u.edgeInvocations ?? 0} icon={Cpu} color="text-[#00ff88]" />
        <Stat label="Deployments" value={u.totalDeployments ?? 0} icon={Activity} color="text-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <HardDrive size={16} /> Storage usage
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Deployments', used: u.deploymentsStorage ?? 0, total: 10 * 1024 * 1024 * 1024 },
              { label: 'Build cache', used: u.cacheStorage ?? 0, total: 5 * 1024 * 1024 * 1024 },
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

        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} /> Billing history
          </h3>
          <div className="text-center py-8 text-[#888888]">
            <CreditCard size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No billing history</p>
            <p className="text-xs mt-1">No payments have been processed</p>
          </div>
        </div>
      </div>
    </div>
  )
}