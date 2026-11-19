import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useToast } from '../components/ToastProvider'
import { NewProjectModal } from '../components/NewProjectModal'

export default function NewProject() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { addToast } = useToast()

  const createMutation = useMutation({
    mutationFn: (data: { name: string; framework: string; repoPath: string }) =>
      api.post('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Project created', 'success')
      navigate('/projects')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const githubMutation = useMutation({
    mutationFn: (data: { repo: string; name?: string }) =>
      api.post('/github', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Imported from GitHub', 'success')
      navigate('/projects')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">New Project</h2>
        <p className="text-[var(--text-dim)] text-sm">Create a new deployment project</p>
      </div>
      <NewProjectModal
        open
        onClose={() => navigate('/projects')}
        onSubmit={(data) => createMutation.mutate(data)}
        onGitHubImport={(repo, name) => githubMutation.mutateAsync({ repo, name })}
      />
    </div>
  )
}