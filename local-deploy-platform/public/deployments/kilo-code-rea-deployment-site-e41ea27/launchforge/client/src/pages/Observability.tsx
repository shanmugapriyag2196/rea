import React from 'react'
import { Activity, Server, Cpu, HardDrive, Clock, AlertCircle, CheckCircle, TrendingUp, Database } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDuration, formatDate } from '../lib/utils'

// Observability shows actual application data only. No fabricated metrics.
export default function Observability() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get('/analytics'),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects'),
  })

  const { data: deploymentsData } = useQuery({
    queryKey: ['deployments-all'],
    queryFn: () => api.get('/deployments'),
  })

  const a = analytics
  const projects = projectsData?.projects || []
  const deployments = deploymentsData?.deployments || []
  const ready = deployments.filter((d: any) => d.status === 'ready').length
  const building = deployments.filter((d: any) => d.status === 'building').length
  const failed = deployments.filter((d: any) => d.status === 'failed').length
  const queued = deployments.filter((d: any) => d.status === 'queued').length

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
    return <div className="text-[#888888] text-sm py-8 text-center">Loading observability data...</div>
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Observability</h2>
        <p className="text-sm text-[#888888] mt-1">Application health and deployment activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Projects" value={projects.length} icon={Database} color="text-white" />
        <Stat label="Total Deployments" value={deployments.length} icon={Activity} color="text-[#00a3ff]" />
        <Stat label="Ready" value={ready} icon={CheckCircle} color="text-[#00ff88]" />
        <Stat label="Failed" value={failed} icon={AlertCircle} color="text-[#ff3b3b]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Building" value={building} icon={Clock} color="text-[#ffb020]" />
        <Stat label="Queued" value={queued} icon={TrendingUp} color="text-[#00a3ff]" />
        <Stat label="Success Rate" value={a?.success_rate != null ? `${a.success_rate}%` : '—'} icon={TrendingUp} color="text-[#00ff88]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Server size={16} /> Runtime information
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Environment', value: a?.env || 'development' },
              { label: 'Host', value: '127.0.0.1' },
              { label: 'Port', value: '3001' },
              { label: 'Database', value: 'better-sqlite3 (local)' },
              { label: 'Avg build time', value: a?.avg_build_duration_ms != null ? formatDuration(a.avg_build_duration_ms) : '—' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between p-3 rounded-lg bg-[#111111]">
                <span className="text-sm text-[#888888]">{row.label}</span>
                <span className="text-sm text-white font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity size={16} /> Recent activity
          </h3>
          {deployments.length > 0 ? (
            <div className="space-y-2">
              {deployments.slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-[#111111]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      d.status === 'ready' ? 'bg-[#00ff88]' :
                      d.status === 'failed' ? 'bg-[#ff3b3b]' :
                      d.status === 'building' ? 'bg-[#ffb020]' : 'bg-[#00a3ff]'
                    }`} />
                    <span className="text-sm text-white">{d.projectName || 'Unknown'}</span>
                  </div>
                  <span className="text-xs text-[#888888]">{formatDate(d.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[#888888]">
              <Activity size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No deployment activity yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}