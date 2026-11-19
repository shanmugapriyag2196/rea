import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useToast } from './ToastProvider'
import {
  LayoutGrid, FolderOpen, BarChart3, Globe, Cpu, Settings,
  User, LogOut, ChevronDown, Activity, Zap, Shield, Code2,
  Rocket, Terminal, FileText, Layout, HardDrive, Plug, Database,
  Server, Users, CreditCard, BookOpen,
} from 'lucide-react'

const MAIN_NAV = [
  { label: 'Overview', to: '/', icon: LayoutGrid },
  { label: 'Projects', to: '/projects', icon: FolderOpen },
  { label: 'Deployments', to: '/deployments', icon: Rocket },
  { label: 'Templates', to: '/templates', icon: Layout },
  { label: 'Storage', to: '/storage', icon: HardDrive },
  { label: 'Integrations', to: '/integrations', icon: Plug },
  { label: 'Domains', to: '/domains', icon: Globe },
  { label: 'Observability', to: '/observability', icon: Server },
  { label: 'Logs', to: '/logs', icon: Terminal },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
]

const CONFIG_NAV = [
  { label: 'Environment Variables', to: '/env-vars', icon: FileText },
  { label: 'Team', to: '/team', icon: Users },
  { label: 'Billing', to: '/billing', icon: CreditCard },
  { label: 'Settings', to: '/settings', icon: Settings },
]

export function Sidebar() {
  const location = useLocation()
  const { addToast } = useToast()
  const [showSignOut, setShowSignOut] = useState(false)

  const handleSignOut = () => {
    localStorage.removeItem('lf_user')
    addToast('Signed out successfully', 'success')
    setShowSignOut(false)
    setTimeout(() => window.location.reload(), 500)
  }

  return (
    <aside className="w-64 h-screen bg-black border-r border-[#222222] flex flex-col fixed left-0 top-0 z-30">
      <div className="p-4 border-b border-[#222222]">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Code2 size={18} className="text-black" />
          </div>
          <span className="font-semibold text-lg tracking-tight">VG Deployment App</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        <div>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
            Main navigation
          </div>
          <div className="space-y-0.5 mt-1">
            {MAIN_NAV.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
                    ${active
                      ? 'bg-[#111111] text-white'
                      : 'text-[#888888] hover:text-white hover:bg-[#0f0f0f]'
                    }
                  `}
                >
                  <Icon size={16} className={active ? 'text-white' : 'text-[#555555]'} />
                  {item.label}
                  {active && <span className="ml-auto w-1 h-4 rounded-full bg-white" />}
                </Link>
              )
            })}
          </div>
        </div>

        <div>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#555555]">
            Configuration
          </div>
          <div className="space-y-0.5 mt-1">
            {CONFIG_NAV.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150
                    ${active
                      ? 'bg-[#111111] text-white'
                      : 'text-[#888888] hover:text-white hover:bg-[#0f0f0f]'
                    }
                  `}
                >
                  <Icon size={16} className={active ? 'text-white' : 'text-[#555555]'} />
                  {item.label}
                  {active && <span className="ml-auto w-1 h-4 rounded-full bg-white" />}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="p-3 border-t border-[#222222]">
        <button
          onClick={() => setShowSignOut(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#0f0f0f] transition group"
        >
          <div className="w-7 h-7 rounded-full bg-[#222222] flex items-center justify-center text-xs font-semibold text-white">
            U
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm text-white font-medium">Local User</div>
            <div className="text-xs text-[#555555]">Free plan</div>
          </div>
          <ChevronDown size={14} className="text-[#555555] group-hover:text-white transition" />
        </button>

        {showSignOut && (
          <div className="mt-2 p-3 rounded-md bg-[#0f0f0f] border border-[#222222]">
            <p className="text-xs text-[#888888] mb-2">Sign out of your local account?</p>
            <div className="flex gap-2">
              <button
                onClick={handleSignOut}
                className="flex-1 px-2 py-1.5 text-xs bg-white text-black rounded hover:bg-gray-200 transition"
              >
                Sign out
              </button>
              <button
                onClick={() => setShowSignOut(false)}
                className="flex-1 px-2 py-1.5 text-xs bg-[#1a1a1a] text-white rounded hover:bg-[#2a2a2a] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}