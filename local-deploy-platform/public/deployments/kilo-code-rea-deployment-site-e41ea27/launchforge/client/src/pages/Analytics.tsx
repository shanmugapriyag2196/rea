import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { TrendingUp, Folder, Rocket, Clock, Activity } from 'lucide-react'
import { formatDuration } from '../lib/utils'

export default function Analytics() {
  const { data: a, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get('/analytics'),
  })

  if (isLoading) return <div className="text-[var(--text-dim)]">Loading...</div>

  const hasData = (a?.total_deployments ?? 0) > 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <p className="text-[var(--text-dim)] text-sm">Locally collected deployment statistics</p>
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <Activity size={48} className="mx-auto mb-3 text-[var(--text-dim)] opacity-50" />
          <h3 className="font-semibold mb-1">No data yet</h3>
          <p className="text-[var(--text-dim)] text-sm">Create projects and deploy to see analytics</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)] text-sm">Projects</span>
              <Folder size={18} className="text-forge-400" />
            </div>
            <div className="text-3xl font-bold mt-2">{a.total_projects}</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)] text-sm">Deployments</span>
              <Rocket size={18} className="text-blue-400" />
            </div>
            <div className="text-3xl font-bold mt-2">{a.total_deployments}</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)] text-sm">Success Rate</span>
              <TrendingUp size={18} className="text-green-400" />
            </div>
            <div className="text-3xl font-bold mt-2">{a.success_rate}%</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)] text-sm">Avg Build</span>
              <Clock size={18} className="text-yellow-400" />
            </div>
            <div className="text-3xl font-bold mt-2">{a.avg_build_duration_ms ? formatDuration(a.avg_build_duration_ms) : '—'}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-[var(--text-dim)] text-sm">Successful</div>
          <div className="text-2xl font-bold text-green-400 mt-1">{a?.successful_deployments ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--text-dim)] text-sm">Failed</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{a?.failed_deployments ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--text-dim)] text-sm">Queued</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{a?.queued_deployments ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-[var(--text-dim)] text-sm">Building</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{a?.building_deployments ?? 0}</div>
        </div>
      </div>
    </div>
  )
}
