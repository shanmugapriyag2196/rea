import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Plus, Trash2, Eye, EyeOff, Key, Shield } from 'lucide-react'

interface Props {
  projectId: string
  onToast: (t: { msg: string; type: 'success' | 'error' }) => void
}

export function EnvTab({ projectId, onToast }: Props) {
  const [showKey, setShowKey] = useState<string | null>(null)
  const [newVar, setNewVar] = useState({ key: '', value: '', is_secret: false, scope: 'build' })
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['envvars', projectId],
    queryFn: () => api.get(`/env-vars/${projectId}`),
  })

  const createMutation = useMutation({
    mutationFn: (v: any) => api.post(`/env-vars/${projectId}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envvars', projectId] })
      setNewVar({ key: '', value: '', is_secret: false, scope: 'build' })
      onToast({ msg: 'Environment variable added', type: 'success' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete(`/env-vars/${projectId}/${encodeURIComponent(key)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envvars', projectId] })
      onToast({ msg: 'Environment variable deleted', type: 'success' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const vars = data?.env_vars || []

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Key size={16} /> Environment Variables
        </h3>
        <span className="text-xs text-[var(--text-dim)]">Local records only</span>
      </div>
      <p className="text-xs text-[var(--text-dim)] mb-4">
        These are local configuration records. They are injected into builds via an explicit, controlled mechanism. They do not provide secure cloud secret storage.
      </p>

      <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
        <input
          placeholder="KEY"
          value={newVar.key}
          onChange={(e) => setNewVar({ ...newVar, key: e.target.value.toUpperCase() })}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-forge-500"
        />
        <input
          placeholder="Value"
          type={newVar.is_secret ? 'password' : 'text'}
          value={newVar.value}
          onChange={(e) => setNewVar({ ...newVar, value: e.target.value })}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-forge-500"
        />
        <select
          value={newVar.scope}
          onChange={(e) => setNewVar({ ...newVar, scope: e.target.value })}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-forge-500"
        >
          <option value="development">development</option>
          <option value="build">build</option>
          <option value="runtime">runtime</option>
        </select>
        <button
          onClick={() => createMutation.mutate(newVar)}
          disabled={!newVar.key || !newVar.value}
          className="flex items-center justify-center gap-1 bg-forge-600 hover:bg-forge-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {vars.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-dim)] text-sm">
          No environment variables yet
        </div>
      ) : (
        <div className="space-y-2">
          {vars.map((v: any) => (
            <div key={v.key} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface-2)]">
              <Shield size={14} className={v.is_secret ? 'text-yellow-400' : 'text-[var(--text-dim)]'} />
              <code className="text-sm font-mono flex-1">{v.key}</code>
              <code className="text-sm font-mono text-[var(--text-dim)]">
                {v.is_secret && showKey !== v.key ? '••••••••' : v.masked_value}
              </code>
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-dim)]">
                {v.scope}
              </span>
              <button
                onClick={() => deleteMutation.mutate(v.key)}
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