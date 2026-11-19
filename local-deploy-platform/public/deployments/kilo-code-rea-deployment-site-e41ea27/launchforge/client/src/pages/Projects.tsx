import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Folder, FolderGit2, CheckCircle2, Clock, AlertCircle, ChevronRight, LayoutGrid, List, Filter } from 'lucide-react'
import { useToast } from '../components/ToastProvider'
import { ConfirmDialog } from '../components/ConfirmDialog'

export default function Projects() {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [frameworkFilter, setFrameworkFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { addToast } = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['projects', search],
    queryFn: () => api.get('/projects' + (search ? '?search=' + encodeURIComponent(search) : '')),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Project created', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete('/projects/' + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Project deleted', 'success')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const deployMutation = useMutation({
    mutationFn: (id: string) => api.post('/deployments/' + id + '/deploy', {}),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Deployment ' + r.status, r.status === 'ready' ? 'success' : 'error')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const projects = data?.projects || []

  return (
    <div className="page-enter">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Projects</h1>
          <p className="text-sm text-[#888888] mt-0.5">{projects.length} projects</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 bg-[#0a0a0a] border border-[#222222] rounded-md pl-9 pr-3 py-1.5 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition"
            />
          </div>
          <button
            onClick={() => navigate('/templates')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
          >
            <Plus size={14} /> Create New
          </button>
        </div>
      </div>

      {isLoading && <div className="text-[#555555] text-sm py-12 text-center">Loading projects...</div>}

      {!isLoading && projects.length === 0 && (
        <div className="card p-12 text-center border-dashed">
          <Folder size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No projects yet</h3>
          <p className="text-sm text-[#555555] mb-4">Create your first project to get started</p>
          <button
            onClick={() => navigate('/templates')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
          >
            <Plus size={14} /> Create New
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p: any) => (
          <ProjectCard
            key={p.id}
            project={p}
            onDeploy={deployMutation.mutate}
            onOpen={(id) => navigate('/projects/' + id)}
            onDelete={setDeleteId}
            onOpenSettings={(id) => navigate('/projects/' + id + '/settings')}
          />
        ))}
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete project"
        message="This will permanently delete the project and all its deployments. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null) }}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />
    </div>
  )
}