import React from 'react'
import { User, Shield, Globe, Bell, Palette, Database } from 'lucide-react'

export default function Settings() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-[var(--text-dim)] text-sm">Local application settings</p>
      </div>

      <div className="card p-6 mb-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User size={16} /> Account
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1">Display Name</label>
            <input
              type="text"
              defaultValue="Local User"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1">Email</label>
            <input
              type="email"
              defaultValue="user@local.launchforge"
              disabled
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm opacity-60"
            />
          </div>
          <p className="text-xs text-[var(--text-dim)]">
            This is a local-only account placeholder. VG Deployment App does not implement a production authentication system.
          </p>
        </div>
      </div>

      <div className="card p-6 mb-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Palette size={16} /> Appearance
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-[var(--text-dim)] mb-1">Theme</label>
            <select className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-forge-500">
              <option>Dark</option>
              <option>Light</option>
              <option>System</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Database size={16} /> Data & Storage
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-2)]">
            <span className="text-[var(--text-dim)]">Database</span>
            <code className="text-xs">./data/launchforge.db</code>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-2)]">
            <span className="text-[var(--text-dim)]">Deployments</span>
            <code className="text-xs">./deployments/</code>
          </div>
          <p className="text-xs text-[var(--text-dim)]">
            All data is stored locally on this machine. No data is sent to external services.
          </p>
        </div>
      </div>
    </div>
  )
}
