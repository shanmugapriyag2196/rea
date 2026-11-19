import React, { useState } from 'react'
import { useToast } from './ToastProvider'
import { X, Plus, Globe, Layout, FolderOpen, Code2, Cpu, Settings, User, LogOut, ChevronDown, Activity, Zap, Shield, BarChart3, Terminal, Eye, Copy, Check, ExternalLink, Search, Bell, Command, Trash2, Rocket, GitFork, Link as LinkIcon } from 'lucide-react'

export function NewProjectModal({ open, onClose, onSubmit, onGitHubImport }: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { name: string; framework: string; repoPath: string }) => void
  onGitHubImport: (repo: string, name?: string) => Promise<void>
}) {
  const { addToast } = useToast()
  const [name, setName] = useState('')
  const [framework, setFramework] = useState('static')
  const [repoPath, setRepoPath] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'local' | 'github'>('local')
  const [githubRepo, setGithubRepo] = useState('')
  const [githubName, setGithubName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const frameworks = [
    { value: 'static', label: 'Static HTML', icon: '🌐' },
    { value: 'vite', label: 'Vite + React', icon: '⚡' },
    { value: 'next', label: 'Next.js', icon: '▲' },
    { value: 'node', label: 'Node.js', icon: '🟢' },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'github') {
      handleGitHubSubmit(e)
      return
    }
    if (!name.trim()) {
      setError('Project name is required')
      return
    }
    setError('')
    addToast('Project created successfully', 'success')
    onSubmit({ name: name.trim(), framework, repoPath: repoPath.trim() })
    setName('')
    setRepoPath('')
    setFramework('static')
    setMode('local')
    onClose()
  }

  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!githubRepo.trim()) {
      setImportError('GitHub repo URL is required')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      await onGitHubImport(githubRepo.trim(), githubName.trim() || undefined)
      addToast('Imported from GitHub', 'success')
      setGithubRepo('')
      setGithubName('')
      setMode('local')
      onClose()
    } catch (err: any) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-[#222222] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#222222]">
          <h2 className="text-lg font-semibold text-white">New Project</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#1a1a1a] text-[#888888] hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-[#222222]">
          <button
            type="button"
            onClick={() => { setMode('local'); setImportError('') }}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
              mode === 'local' ? 'border-white text-white' : 'border-transparent text-[#555555] hover:text-white'
            }`}
          >
            Local Project
          </button>
          <button
            type="button"
            onClick={() => { setMode('github'); setError('') }}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
              mode === 'github' ? 'border-white text-white' : 'border-transparent text-[#555555] hover:text-white'
            }`}
          >
            <GitFork size={14} /> Import from GitHub
          </button>
        </div>

        {mode === 'github' ? (
          <form onSubmit={handleGitHubSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">GitHub Repository URL</label>
              <div className="relative">
                <GitFork size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => { setGithubRepo(e.target.value); setImportError('') }}
                  placeholder="github.com/owner/repo"
                  className="w-full bg-[#111111] border border-[#222222] rounded-md pl-9 pr-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
                />
              </div>
              <p className="text-xs text-[#555555] mt-1">Public repos only. Supports github.com/owner/repo or full URLs.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Project Name (optional)</label>
              <input
                type="text"
                value={githubName}
                onChange={(e) => setGithubName(e.target.value)}
                placeholder="Defaults to repo name"
                className="w-full bg-[#111111] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition"
              />
            </div>
            {importError && <p className="text-xs text-[#ff3b3b]">{importError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode('local')}
                className="px-4 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={importing || !githubRepo.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import & Create'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                placeholder="my-awesome-app"
                className="w-full bg-[#111111] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition"
              />
              {error && <p className="text-xs text-[#ff3b3b] mt-1">{error}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Framework</label>
              <div className="grid grid-cols-2 gap-2">
                {frameworks.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFramework(f.value)}
                    className={`
                      flex items-center gap-2 p-2.5 rounded-md border text-sm transition
                      ${framework === f.value
                        ? 'bg-white text-black border-white'
                        : 'bg-[#111111] text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
                      }
                    `}
                  >
                    <span>{f.icon}</span>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Local Repository Path (optional)</label>
              <input
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/path/to/your/project"
                className="w-full bg-[#111111] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
              >
                Create Project
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}