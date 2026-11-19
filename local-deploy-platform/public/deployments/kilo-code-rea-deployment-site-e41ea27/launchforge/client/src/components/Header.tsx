import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, Bell, Plus, ChevronDown, Command } from 'lucide-react'
import { useToast } from './ToastProvider'

interface HeaderProps {
  onNewProject: () => void
  onSearch?: (query: string) => void
  searchQuery?: string
}

export function Header({ onNewProject, onSearch, searchQuery = '' }: HeaderProps) {
  const location = useLocation()
  const { addToast } = useToast()

  const titles: Record<string, string> = {
    '/': 'Overview',
    '/projects': 'Projects',
    '/analytics': 'Analytics',
    '/domains': 'Domains',
    '/usage': 'Usage & Billing',
    '/settings': 'Settings',
  }

  const title = titles[location.pathname] || 'VG Deployment App'

  const handleCommandPalette = () => {
    addToast('Command palette coming soon', 'info')
  }

  return (
    <header className="h-14 border-b border-[#222222] bg-black flex items-center px-4 gap-3 sticky top-0 z-20">
      <div className="flex items-center gap-2 text-sm text-[#888888]">
        <Link to="/" className="hover:text-white transition">VG Deployment App</Link>
        <span>/</span>
        <span className="text-white font-medium">{title}</span>
      </div>

      <div className="flex-1 flex items-center justify-end gap-2">
        {/* Search */}
        {onSearch && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-64 bg-[#0a0a0a] border border-[#222222] rounded-md pl-9 pr-3 py-1.5 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-[#444444] transition"
            />
          </div>
        )}

        {/* Command palette button */}
        <button
          onClick={handleCommandPalette}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#555555] bg-[#0a0a0a] border border-[#222222] rounded-md hover:text-white hover:border-[#444444] transition"
        >
          <Command size={12} />
          <span>K</span>
        </button>

        <button
          onClick={onNewProject}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
        >
          <Plus size={14} />
          <span>New</span>
        </button>

        <button className="p-2 text-[#888888] hover:text-white hover:bg-[#0a0a0a] rounded-md transition">
          <Bell size={16} />
        </button>
      </div>
    </header>
  )
}