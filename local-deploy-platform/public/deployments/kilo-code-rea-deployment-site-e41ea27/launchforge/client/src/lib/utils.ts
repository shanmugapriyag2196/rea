import { clsx } from 'clsx'

export function cn(...inputs: Array<string | false | null | undefined>): string {
  return clsx(inputs)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function statusColor(status: string): string {
  switch (status) {
    case 'ready': return 'text-green-500'
    case 'failed': return 'text-red-500'
    case 'building': return 'text-yellow-500'
    case 'queued': return 'text-blue-500'
    case 'canceled': return 'text-gray-500'
    default: return 'text-gray-400'
  }
}

export function statusBadge(status: string): string {
  switch (status) {
    case 'ready': return 'bg-green-500/10 text-green-400 border-green-500/30'
    case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/30'
    case 'building': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
    case 'queued': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    case 'canceled': return 'bg-gray-500/10 text-gray-400 border-gray-500/30'
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30'
  }
}