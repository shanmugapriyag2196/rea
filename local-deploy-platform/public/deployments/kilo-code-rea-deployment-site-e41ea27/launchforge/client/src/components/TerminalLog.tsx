import React from 'react'

interface Props {
  logs: string
  status: string
}

export function TerminalLog({ logs, status }: Props) {
  const lines = logs ? logs.split('\n') : []

  const statusColor: Record<string, string> = {
    ready: 'text-[#00ff88]',
    failed: 'text-[#ff3b3b]',
    building: 'text-[#ffb020]',
    queued: 'text-[#00a3ff]',
    canceled: 'text-[#888888]',
  }

  return (
    <div className="terminal-bg rounded-md border border-[#222222] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#050505] border-b border-[#222222]">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <span className="w-3 h-3 rounded-full bg-[#27ca3f]" />
        </div>
        <span className="text-xs text-[#555555] ml-2 font-mono">build-output.log</span>
        <span className={`ml-auto text-xs font-mono ${statusColor[status] || 'text-[#888888]'}`}>
          {status}
        </span>
      </div>
      <pre className="p-3 text-xs font-mono text-[#888888] whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
        {lines.length > 0 ? logs : (
          <span className="text-[#333333]">$ waiting for build output...</span>
        )}
      </pre>
    </div>
  )
}