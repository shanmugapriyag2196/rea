import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Plus, Trash2, Globe, AlertCircle } from 'lucide-react'

interface Props {
  projectId: string
  onToast: (t: { msg: string; type: 'success' | 'error' }) => void
}

export function DomainsTab({ projectId, onToast }: Props) {
  const [newDomain, setNewDomain] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['domains', projectId],
    queryFn: () => api.get(`/domains/${projectId}`),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post(`/domains/${projectId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains', projectId] })
      setNewDomain('')
      onToast({ msg: 'Domain alias added', type: 'success' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/domains/${projectId}/${encodeURIComponent(name)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains', projectId] })
      onToast({ msg: 'Domain removed', type: 'success' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const domains = data?.domains || []

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Globe size={16} /> Domain Aliases
        </h3>
      </div>
      <p className="text-xs text-[var(--text-dim)] mb-4">
        Local domain-alias records for this project. These do not modify public DNS. Preview URLs are served on localhost by default.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="example.com"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500"
        />
        <button
          onClick={() => createMutation.mutate(newDomain)}
          disabled={!newDomain}
          className="flex items-center gap-1 bg-forge-600 hover:bg-forge-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {domains.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-dim)] text-sm">
          <Globe size={32} className="mx-auto mb-2 opacity-50" />
          <p>No domain aliases configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-2)]">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-forge-400" />
                <code className="text-sm font-mono">{d.name}</code>
                {d.is_primary && <span className="text-xs px-2 py-0.5 rounded bg-forge-500/10 text-forge-400">primary</span>}
              </div>
              <button
                onClick={() => deleteMutation.mutate(d.name)}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}