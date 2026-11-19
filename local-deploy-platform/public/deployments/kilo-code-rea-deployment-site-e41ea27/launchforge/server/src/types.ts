export interface Project {
  id: string
  name: string
  slug: string | null
  framework: string | null
  buildCommand: string | null
  installCommand: string | null
  outputDir: string | null
  rootDir: string | null
  repoPath: string | null
  createdAt: number
  updatedAt: number
  settings: Record<string, unknown>
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

export interface Settings {
  [key: string]: string
}

export type Framework =
  | 'static'
  | 'vite'
  | 'next'
  | 'react'
  | 'preact'
  | 'svelte'
  | 'astro'
  | 'node'
  | 'unknown'

export const FRAMEWORK_DEFAULTS: Record<Framework, { buildCommand: string | null; installCommand: string | null; outputDir: string }> = {
  static: { buildCommand: null, installCommand: null, outputDir: 'public' },
  vite: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'dist' },
  next: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'out' },
  react: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'dist' },
  preact: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'build' },
  svelte: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'build' },
  astro: { buildCommand: 'npm run build', installCommand: 'npm install', outputDir: 'dist' },
  node: { buildCommand: null, installCommand: 'npm install', outputDir: '.' },
  unknown: { buildCommand: null, installCommand: null, outputDir: '.' },
}