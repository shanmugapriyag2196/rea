import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Terminal as TerminalIcon, Search, Filter, Clock, Check, X, AlertCircle, RotateCcw } from 'lucide-react'
import { formatDate } from '../lib/utils'

// TODO: wire api.get('/logs') to the query below
export default function Logs() {
  const { data, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: () => api.get('/logs'),
  })

  const [search, setSearch] = useState('')
  const logs = data?.logs || []

  const filtered = logs.filter((l: any) =>
    (l.message || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.source || '').toLowerCase().includes(search.toLowerCase())
  )

  const levelConfig: Record<string, { color: string; icon: any }> = {
    info: { color: 'text-[#00a3ff]', icon: Check },
    warn: { color: 'text-[#ffb020]', icon: AlertCircle },
    error: { color: 'text-[#ff3b3b]', icon: X },
    success: { color: 'text-[#00ff88]', icon: Check },
  }

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Logs</h2>
        <p className="text-sm text-[#888888] mt-0.5">System and build logs across all projects</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#222222] rounded-md pl-9 pr-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition">
          <Filter size={14} /> Filter
        </button>
      </div>

      {isLoading ? (
        <div className="text-[#555555] text-sm py-8 text-center">Loading logs...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <TerminalIcon size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No logs found</h3>
          <p className="text-sm text-[#555555]">Logs will appear here as projects build and deploy</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="bg-[#050505] border-b border-[#222222] px-4 py-2 flex items-center gap-2">
            <TerminalIcon size={14} className="text-[#555555]" />
            <span className="text-xs text-[#555555] font-mono">launchforge.log</span>
            <span className="ml-auto text-xs text-[#555555]">{filtered.length} entries</span>
          </div>
          <div className="p-4 font-mono text-xs space-y-1 max-h-[600px] overflow-y-auto">
            {filtered.map((l: any, i: number) => {
              const cfg = levelConfig[l.level] || levelConfig.info
              const Icon = cfg.icon
              return (
                <div key={i} className="flex items-start gap-2 hover:bg-[#0a0a0a] px-2 py-1 rounded">
                  <span className="text-[#555555] flex-shrink-0">{formatDate(l.created_at).split(',')[1]?.trim() || formatDate(l.created_at)}</span>
                  <Icon size={12} className={`flex-shrink-0 mt-0.5 ${cfg.color}`} />
                  <span className="text-[#888888] flex-1 break-words">{l.message}</span>
                  {l.source && <span className="text-[#333333] flex-shrink-0">{l.source}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}