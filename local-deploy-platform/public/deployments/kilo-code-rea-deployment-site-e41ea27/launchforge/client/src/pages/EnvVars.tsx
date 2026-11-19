import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/ToastProvider'
import { Plus, Trash2, Eye, EyeOff, Key, Shield, Save } from 'lucide-react'

// TODO: wire api.get('/env-vars') / post / delete into the mutations below
export default function EnvVars() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const [newVar, setNewVar] = useState({ key: '', value: '', is_secret: false, scope: 'build' })
  const [showKey, setShowKey] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['envvars-all'],
    queryFn: () => api.get('/env-vars'),
  })

  const createMutation = useMutation({
    mutationFn: (v: any) => api.post('/env-vars', v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envvars-all'] })
      setNewVar({ key: '', value: '', is_secret: false, scope: 'build' })
      addToast('Environment variable added', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete('/env-vars/' + encodeURIComponent(key)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envvars-all'] })
      addToast('Environment variable deleted', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const vars = data?.env_vars || []

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Environment Variables</h2>
        <p className="text-sm text-[#888888] mt-0.5">Manage environment variables across all projects</p>
      </div>

      <div className="card p-6 mb-6">
        <form
          onSubmit={(e) => { e.preventDefault(); if (newVar.key && newVar.value) createMutation.mutate(newVar) }}
          className="grid grid-cols-12 gap-2"
        >
          <input
            placeholder="KEY"
            value={newVar.key}
            onChange={(e) => setNewVar({ ...newVar, key: e.target.value.toUpperCase() })}
            className="col-span-4 bg-[#0a0a0a] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
          />
          <input
            placeholder="Value"
            type={newVar.is_secret ? 'password' : 'text'}
            value={newVar.value}
            onChange={(e) => setNewVar({ ...newVar, value: e.target.value })}
            className="col-span-4 bg-[#0a0a0a] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
          />
          <select
            value={newVar.scope}
            onChange={(e) => setNewVar({ ...newVar, scope: e.target.value })}
            className="col-span-2 bg-[#0a0a0a] border border-[#222222] rounded-md px-2 py-2 text-sm text-white focus:outline-none focus:border-white transition"
          >
            <option value="build">build</option>
            <option value="runtime">runtime</option>
            <option value="development">development</option>
          </select>
          <button
            type="submit"
            disabled={!newVar.key || !newVar.value}
            className="col-span-2 flex items-center justify-center gap-1 bg-white text-black rounded-md hover:bg-gray-200 transition font-medium text-sm disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </form>
      </div>

      {isLoading ? (
        <div className="text-[#555555] text-sm py-8 text-center">Loading variables...</div>
      ) : vars.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <Key size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No environment variables</h3>
          <p className="text-sm text-[#555555]">Add a variable to inject into builds</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#555555] text-xs uppercase tracking-wider border-b border-[#222222]">
                <th className="px-6 py-3 font-medium">Key</th>
                <th className="px-6 py-3 font-medium">Value</th>
                <th className="px-6 py-3 font-medium">Scope</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vars.map((v: any) => (
                <tr key={v.key} className="border-b border-[#1a1a1a] hover:bg-[#0a0a0a] transition">
                  <td className="px-6 py-3 font-mono text-white flex items-center gap-2">
                    {v.is_secret && <Shield size={12} className="text-[#ffb020]" />}
                    {v.key}
                  </td>
                  <td className="px-6 py-3 font-mono text-[#888888]">
                    {v.is_secret && showKey !== v.key ? '••••••••' : v.masked_value || v.value}
                  </td>
                  <td className="px-6 py-3 text-[#888888] text-xs">{v.scope}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setShowKey(showKey === v.key ? null : v.key)}
                      className="p-1.5 rounded hover:bg-[#222222] text-[#888888] hover:text-white transition mr-1"
                    >
                      {showKey === v.key ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(v.key)}
                      className="p-1.5 rounded hover:bg-[#ff3b3b]/10 text-[#888888] hover:text-[#ff3b3b] transition"
                    >
                      <Trash2 size={14} />
                    </button>
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