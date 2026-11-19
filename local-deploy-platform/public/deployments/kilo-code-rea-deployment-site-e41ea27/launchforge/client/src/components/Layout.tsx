import React from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  const titles: Record<string, string> = {
    '/': 'Overview',
    '/projects': 'Projects',
    '/projects/new': 'New Project',
    '/templates': 'Templates',
    '/deployments': 'Deployments',
    '/storage': 'Storage',
    '/integrations': 'Integrations',
    '/domains': 'Domains',
    '/observability': 'Observability',
    '/logs': 'Logs',
    '/analytics': 'Analytics',
    '/env-vars': 'Environment Variables',
    '/team': 'Team',
    '/billing': 'Billing',
    '/usage': 'Usage & Billing',
    '/settings': 'Settings',
  }

  const title = titles[location.pathname] || 'VG Deployment App'

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-auto">
        <header className="h-14 border-b border-[#222222] bg-black flex items-center px-6 gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm text-[#888888]">
            <span className="text-white font-medium">{title}</span>
          </div>
        </header>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}