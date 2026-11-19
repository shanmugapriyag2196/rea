import React, { useEffect } from 'react'
import { Check, X, AlertCircle, Info } from 'lucide-react'

interface Props {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

const ICONS = {
  success: Check,
  error: X,
  info: Info,
}

const STYLES = {
  success: 'bg-[#0a1a12] border-[#00ff88]/30 text-[#00ff88]',
  error: 'bg-[#1a0a0a] border-[#ff3b3b]/30 text-[#ff3b3b]',
  info: 'bg-[#0a0f1a] border-[#00a3ff]/30 text-[#00a3ff]',
}

export function Toast({ message, type, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  const Icon = ICONS[type]

  return (
    <div className={`toast flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-2xl min-w-[280px] ${STYLES[type]}`}>
      <Icon size={16} className="flex-shrink-0" />
      <span className="text-sm font-medium flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition">
        <X size={14} />
      </button>
    </div>
  )
}