import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Terminal as TerminalIcon, Eye, EyeOff, Play, Trash2, Plus } from 'lucide-react'
import { statusBadge, formatDate, formatDuration } from '../lib/utils'

interface Props {
  projectId: string
  onToast: (t: { msg: string; type: 'success' | 'error' }) => void
  onDelete: (id: string) => void
  onOpenInspector?: (deployment: any) => void
  latestDeployment?: any
}

export function DeploymentsTab({ projectId, onToast, onDelete, onOpenInspector, latestDeployment }: Props) {
  const [showLogs, setShowLogs] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: () => api.get(`/deployments?project_id=${projectId}`),
  })

  const deployMutation = useMutation({
    mutationFn: () => api.post(`/deployments/${projectId}/deploy`),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ['deployments', projectId] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      onToast({ msg: `Deployment ${result.status}`, type: result.status === 'ready' ? 'success' : 'error' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const deployments = data?.deployments || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <TerminalIcon size={16} /> Deployment History
        </h3>
        <button
          onClick={() => deployMutation.mutate()}
          disabled={deployMutation.isPending}
          className="flex items-center gap-2 bg-forge-600 hover:bg-forge-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm"
        >
          <Play size={14} /> {deployMutation.isPending ? 'Building...' : 'Deploy'}
        </button>
      </div>

      {deployments.length === 0 ? (
        <div className="card p-8 text-center text-[var(--text-dim)]">
          <TerminalIcon size={32} className="mx-auto mb-2 opacity-50" />
          <p>No deployments yet</p>
          <p className="text-xs mt-1">Click Deploy to create your first deployment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {latestDeployment && (
            <div className="card p-4 border-white/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={statusBadge(latestDeployment.status) + ' text-xs px-2 py-0.5 rounded-full border'}>{latestDeployment.status}</span>
                  <span className="text-[var(--text-dim)] text-xs">Latest</span>
                  {latestDeployment.duration_ms && (
                    <span className="text-[var(--text-dim)] text-xs">{formatDuration(latestDeployment.duration_ms)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {latestDeployment.preview_path && latestDeployment.status === 'ready' && (
                    <a
                      href={`http://127.0.0.1:3001/api/preview/${latestDeployment.id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20 flex items-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </a>
                  )}
                  <button
                    onClick={() => onOpenInspector?.(latestDeployment)}
                    className="text-xs px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--border)]"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            </div>
          )}
          {deployments.map((d: any) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={statusBadge(d.status) + ' text-xs px-2 py-0.5 rounded-full border'}>{d.status}</span>
                  <span className="text-[var(--text-dim)] text-xs">{formatDate(d.created_at)}</span>
                  {d.duration_ms && <span className="text-[var(--text-dim)] text-xs">{formatDuration(d.duration_ms)}</span>}
                </div>
                <div className="flex gap-2">
                  {d.preview_path && d.status === 'ready' && (
                    <a
                      href={`http://127.0.0.1:3001/api/preview/${d.id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded bg-forge-500/10 text-forge-400 hover:bg-forge-500/20 flex items-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </a>
                  )}
                  <button
                    onClick={() => setShowLogs(showLogs === d.id ? null : d.id)}
                    className="text-xs px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--border)]"
                  >
                    {showLogs === d.id ? 'Hide' : 'Logs'}
                  </button>
                  <button
                    onClick={() => onOpenInspector?.(d)}
                    className="text-xs px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--border)]"
                  >
                    Inspect
                  </button>
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-xs px-2 py-1 rounded hover:bg-red-500/10 text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {showLogs === d.id && (
                <pre className="bg-black/40 rounded-lg p-3 text-xs overflow-auto max-h-64 mt-2 whitespace-pre-wrap">
                  {d.logs || '(no logs)'}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}