import React from 'react'
import { UserPlus, User, Shield, Mail, Clock, Check, X, Search, Plus, Trash2, Edit } from 'lucide-react'
import { useToast } from '../components/ToastProvider'

// Local-only team. No external authentication is configured.
const MEMBERS = [
  { id: '1', name: 'Local User', email: 'user@local.vg', role: 'Owner', status: 'active', joined: '2026-11-02' },
]

export default function Team() {
  const { addToast } = useToast()

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Team</h2>
        <p className="text-sm text-[#888888] mt-1">Manage team members and roles</p>
      </div>

      <div className="card p-4 mb-6 border-[#ffb020]/20 bg-[#ffb020]/5">
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-[#ffb020] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Local-only team</h4>
            <p className="text-xs text-[#888888] leading-relaxed">
              VG Deployment App runs locally. Team invitations and SSO are not available in local mode. Only the local account exists.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#222222]">
          <h3 className="font-semibold text-white">Team members</h3>
          <button
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#111111] text-[#555555] border border-[#222222] rounded-md cursor-not-allowed"
          >
            <Plus size={12} /> Invite member
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#555555] text-xs uppercase tracking-wider border-b border-[#222222]">
              <th className="px-6 py-3 font-medium">Member</th>
              <th className="px-6 py-3 font-medium">Role</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Joined</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => (
              <tr key={m.id} className="border-b border-[#1a1a1a]">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#222222] flex items-center justify-center text-xs font-semibold text-white">
                      {m.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <div className="text-white font-medium">{m.name}</div>
                      <div className="text-xs text-[#888888]">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3 text-[#888888]">{m.role}</td>
                <td className="px-6 py-3">
                  <span className="inline-flex items-center gap-1 text-xs text-[#00ff88]">
                    <Check size={12} /> {m.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-[#888888] text-xs">{m.joined}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    disabled={m.role === 'Owner'}
                    onClick={() => addToast('Local-only mode — cannot remove members', 'info')}
                    className="p-1.5 rounded hover:bg-[#ff3b3b]/10 text-[#888888] hover:text-[#ff3b3b] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}