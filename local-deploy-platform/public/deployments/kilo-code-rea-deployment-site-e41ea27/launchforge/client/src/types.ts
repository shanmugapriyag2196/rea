export interface Project {
  id: string
  name: string
  slug: string
  framework: string | null
  buildCommand: string | null
  installCommand: string | null
  outputDir: string | null
  rootDir: string | null
  repoPath: string | null
  createdAt: number
  updatedAt: number
  settings: Record<string, unknown>
  latestDeployment?: Deployment | null
}

export interface Deployment {
  id: string
  projectId: string
  status: 'queued' | 'building' | 'ready' | 'failed' | 'canceled'
  buildCommand: string | null
  outputDir: string | null
  source: string | null
  logs: string
  exitCode: number | null
  durationMs: number | null
  createdAt: number
  updatedAt: number
  previewPath: string | null
  branch?: string
  commitSha?: string
}

export interface EnvVar {
  id: string
  projectId: string
  key: string
  value: string
  isSecret: boolean
  scope: 'development' | 'build' | 'runtime'
  createdAt: number
  updatedAt: number
}

export interface Domain {
  id: string
  projectId: string
  name: string
  isPrimary: boolean
  createdAt: number
  updatedAt: number
}

export interface Analytics {
  totalProjects: number
  totalDeployments: number
  successfulDeployments: number
  failedDeployments: number
  queuedDeployments: number
  buildingDeployments: number
  successRate: number | null
  avgBuildDurationMs: number | null
  recentDeployments: Array<{ id: string; projectId: string; status: string; createdAt: number; durationMs: number | null }>
}

export interface Template {
  key: string
  name: string
  description: string
  framework: string
  buildCommand: string | null
  installCommand: string | null
  outputDir: string
}

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge?: string
}