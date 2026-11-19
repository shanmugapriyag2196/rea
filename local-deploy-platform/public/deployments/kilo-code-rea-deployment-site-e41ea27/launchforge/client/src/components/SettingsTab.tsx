import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Save, Trash2, Plus, Eye, EyeOff } from 'lucide-react'

interface Props {
  projectId: string
  project: any
  onToast: (t: { msg: string; type: 'success' | 'error' }) => void
}

export function SettingsTab({ projectId, project, onToast }: Props) {
  const [form, setForm] = useState({
    name: project.name,
    framework: project.framework || '',
    buildCommand: project.build_command || '',
    installCommand: project.install_command || '',
    outputDir: project.output_dir || '',
    rootDir: project.root_dir || '',
  })
  const qc = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/projects/${projectId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      onToast({ msg: 'Settings saved', type: 'success' })
    },
    onError: (err: any) => onToast({ msg: err.message, type: 'error' }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(form)
  }

  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4">Project Settings</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--text-dim)] mb-1">Project Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1">Framework</label>
            <input
              type="text"
              value={form.framework}
              onChange={(e) => setForm({ ...form, framework: e.target.value })}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1">Root Directory</label>
            <input
              type="text"
              value={form.rootDir}
              onChange={(e) => setForm({ ...form, rootDir: e.target.value })}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-[var(--text-dim)] mb-1">Build Command</label>
          <input
            type="text"
            value={form.buildCommand}
            onChange={(e) => setForm({ ...form, buildCommand: e.target.value })}
            placeholder="e.g. npm run build"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-forge-500"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-dim)] mb-1">Install Command</label>
          <input
            type="text"
            value={form.installCommand}
            onChange={(e) => setForm({ ...form, installCommand: e.target.value })}
            placeholder="e.g. npm install"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-forge-500"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-dim)] mb-1">Output Directory</label>
          <input
            type="text"
            value={form.outputDir}
            onChange={(e) => setForm({ ...form, outputDir: e.target.value })}
            placeholder="e.g. dist"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-forge-500"
          />
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 bg-forge-600 hover:bg-forge-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Save size={14} /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}