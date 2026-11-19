import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'default'
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, variant = 'default' }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#0a0a0a] border border-[#222222] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 flex items-start gap-3">
          {variant === 'danger' && <AlertTriangle size={20} className="text-[#ff3b3b] flex-shrink-0 mt-0.5" />}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
            <p className="text-sm text-[#888888]">{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-[#1a1a1a] text-[#888888] hover:text-white transition">
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md transition font-medium ${
              variant === 'danger'
                ? 'bg-[#ff3b3b] text-white hover:bg-[#e03030]'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}