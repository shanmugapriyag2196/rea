import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Rocket, Globe, FileText, Settings as SettingsIcon, Copy, Check } from 'lucide-react'
import { formatDate } from '../lib/utils'
import { cn } from '../lib/utils'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Toast } from '../components/Toast'
import { DeploymentsTab } from '../components/DeploymentsTab'
import { SettingsTab } from '../components/SettingsTab'
import { EnvTab } from '../components/EnvTab'
import { DomainsTab } from '../components/DomainsTab'
import { DeploymentInspector } from '../components/DeploymentInspector'
import { api } from '../lib/api'

const TABS = [
  { id: 'deployments', label: 'Deployments', icon: Rocket },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'env', label: 'Environment Variables', icon: FileText },
  { id: 'domains', label: 'Domains', icon: Globe },
]

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('deployments')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inspector, setInspector] = useState<{ project: any; deployment: any } | null>(null)

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`),
  })

  const { data: depsData } = useQuery({
    queryKey: ['deployments', id],
    queryFn: () => api.get(`/deployments?project_id=${id}`),
  })

  const project = projectData?.project
  const deployments = depsData?.deployments || []
  const latestDeployment = deployments[0]

  const deployMutation = useMutation({
    mutationFn: () => api.post(`/deployments/${id}/deploy`, {}),
    onSuccess: (r: any) => {
      setToast({ msg: `Deployment ${r.status}`, type: r.status === 'ready' ? 'success' : 'error' })
    },
    onError: (e: any) => setToast({ msg: e.message, type: 'error' }),
  })

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenInspector = (dep: any) => {
    setInspector({ project, deployment: dep })
  }

  if (isLoading) return <div className="text-[var(--text-dim)]">Loading project...</div>
  if (!project) return <div className="text-red-400">Project not found</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/projects')} className="p-2 rounded-lg hover:bg-[var(--surface-2)]">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{project.name}</h2>
            <span className="text-xs text-[var(--text-dim)]">{project.framework || 'unknown'}</span>
          </div>
          <p className="text-[var(--text-dim)] text-sm">Created {formatDate(project.created_at)}</p>
        </div>
        <button onClick={handleCopyUrl} className="p-2 rounded-lg hover:bg-[var(--surface-2)]" title="Copy URL">
          {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
        </button>
      </div>

      <div className="border-b border-[var(--border)] mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition',
                activeTab === tab.id
                  ? 'border-white text-white'
                  : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'
              )}
            >
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'deployments' && (
        <DeploymentsTab
          projectId={id!}
          onToast={setToast}
          onDelete={setDeleteId}
          onOpenInspector={handleOpenInspector}
          latestDeployment={latestDeployment}
        />
      )}
      {activeTab === 'settings' && <SettingsTab projectId={id!} project={project} onToast={setToast} />}
      {activeTab === 'env' && <EnvTab projectId={id!} onToast={setToast} />}
      {activeTab === 'domains' && <DomainsTab projectId={id!} onToast={setToast} />}

      <DeploymentInspector
        open={inspector !== null}
        project={inspector?.project}
        deployment={inspector?.deployment}
        onClose={() => setInspector(null)}
        onRedeploy={(pid) => deployMutation.mutate()}
      />

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete deployment"
        message="This will permanently delete this deployment and its preview files."
        confirmLabel="Delete"
        onConfirm={() => { setDeleteId(null) }}
        onCancel={() => setDeleteId(null)}
        variant="danger"
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}