import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Shield, Plus, Trash2, Check, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../components/ToastProvider'

// TODO: plug api.get('/domains') / post / patch / delete into the mutations below
export default function Domains() {
  const { addToast } = useToast()
  const qc = useQueryClient()
  const [newDomain, setNewDomain] = useState('')
  const [newDomainError, setNewDomainError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.get('/domains'),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/domains', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains'] })
      setNewDomain('')
      addToast('Domain added', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete('/domains/' + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains'] })
      addToast('Domain removed', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.patch('/domains/' + id, { verified: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const domains = data?.domains || []

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDomain.trim()) {
      setNewDomainError('Domain is required')
      return
    }
    setNewDomainError('')
    createMutation.mutate(newDomain.trim())
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Domains</h2>
        <p className="text-sm text-[#888888] mt-0.5">Manage custom domains for your projects</p>
      </div>

      <div className="card p-6 mb-6">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => { setNewDomain(e.target.value); setNewDomainError('') }}
            placeholder="example.com"
            className="flex-1 bg-[#0a0a0a] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium disabled:opacity-50"
          >
            <Plus size={14} /> Add Domain
          </button>
        </form>
        {newDomainError && <p className="text-xs text-[#ff3b3b] mt-2">{newDomainError}</p>}
      </div>

      {isLoading ? (
        <div className="text-[#555555] text-sm py-8 text-center">Loading domains...</div>
      ) : domains.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <Globe size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No domains configured</h3>
          <p className="text-sm text-[#555555]">Add a custom domain to point at your deployments</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#555555] text-xs uppercase tracking-wider border-b border-[#222222]">
                <th className="px-6 py-3 font-medium">Domain</th>
                <th className="px-6 py-3 font-medium">Project</th>
                <th className="px-6 py-3 font-medium">SSL</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d: any) => (
                <tr key={d.id} className="border-b border-[#1a1a1a] hover:bg-[#0a0a0a] transition">
                  <td className="px-6 py-3 font-mono text-white">{d.name}</td>
                  <td className="px-6 py-3 text-[#888888]">{d.projectName || '—'}</td>
                  <td className="px-6 py-3">
                    {d.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#00ff88]">
                        <Check size={12} /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[#ffb020]">
                        <AlertCircle size={12} /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {!d.verified && (
                      <button
                        onClick={() => verifyMutation.mutate(d.id)}
                        className="text-xs text-[#00a3ff] hover:underline mr-3"
                      >
                        Verify
                      </button>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(d.id)}
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