import React from 'react'
import { Rocket, Play, Clock, Check, X, AlertCircle, Eye, Copy, Check as CheckIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/ToastProvider'
import { statusBadge, formatDate, formatDuration } from '../lib/utils'

// TODO: wire api.get('/deployments') to the query below
export default function Deployments() {
  const { addToast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ['deployments-all'],
    queryFn: () => api.get('/deployments'),
  })

  const deployments = data?.deployments || []

  const handleCopy = (id: string) => {
    const url = `http://127.0.0.1:3001/api/preview/${id}/`
    navigator.clipboard.writeText(url)
    addToast('URL copied to clipboard', 'success')
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Deployments</h2>
        <p className="text-sm text-[#888888] mt-0.5">{deployments.length} total deployments across all projects</p>
      </div>

      {isLoading ? (
        <div className="text-[#555555] text-sm py-8 text-center">Loading deployments...</div>
      ) : deployments.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <Rocket size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No deployments yet</h3>
          <p className="text-sm text-[#555555]">Deploy a project to see it here</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#555555] text-xs uppercase tracking-wider border-b border-[#222222]">
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">Project</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Started</th>
                <th className="px-6 py-3 font-medium">Duration</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d: any) => (
                <tr key={d.id} className="border-b border-[#1a1a1a] hover:bg-[#0a0a0a] transition">
                  <td className="px-6 py-3 font-mono text-xs text-[#888888]">{d.id.slice(0, 8)}</td>
                  <td className="px-6 py-3 text-white">{d.projectName || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={statusBadge(d.status) + ' text-xs px-2 py-0.5 rounded-full border'}>{d.status}</span>
                  </td>
                  <td className="px-6 py-3 text-[#888888] text-xs">{formatDate(d.created_at)}</td>
                  <td className="px-6 py-3 text-[#888888] text-xs">
                    {d.duration_ms ? formatDuration(d.duration_ms) : '—'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {d.preview_path && d.status === 'ready' && (
                      <button
                        onClick={() => handleCopy(d.id)}
                        className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition"
                        title="Copy preview URL"
                      >
                        {React.createElement(CheckIcon, { size: 14 })}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}