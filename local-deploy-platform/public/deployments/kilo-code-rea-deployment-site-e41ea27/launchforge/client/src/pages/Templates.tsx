import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from '../components/ToastProvider'
import { GitFork, Bot, Activity, Layout, FlaskConical, FileText, Image, Gamepad2, Calculator, Mail, Search, Filter, Code, Cpu, Globe, BookOpen, Layers, Sparkles, Rocket } from 'lucide-react'

const CATEGORIES = ['All', 'Next.js', 'React', 'Vue', 'Svelte', 'Node.js', 'Python', 'Static Sites']

const TEMPLATES = [
  { key: 'nextjs', name: 'Next.js', description: 'Get started with Next.js and React in seconds', icon: Layout, framework: 'next', category: 'Next.js', tech: ['Next.js', 'React', 'TypeScript'] },
  { key: 'react', name: 'React Vite', description: 'A blank React + Vite starter template', icon: Layers, framework: 'vite', category: 'React', tech: ['React', 'Vite', 'TypeScript'] },
  { key: 'vue', name: 'Vue', description: 'A blank Vue + Vite starter template', icon: Globe, framework: 'vite', category: 'Vue', tech: ['Vue', 'Vite', 'JavaScript'] },
  { key: 'svelte', name: 'SvelteKit', description: 'A blank SvelteKit starter template', icon: Sparkles, framework: 'node', category: 'Svelte', tech: ['SvelteKit', 'Svelte', 'JavaScript'] },
  { key: 'node', name: 'Node.js API', description: 'A blank Node.js + Express API template', icon: Code, framework: 'node', category: 'Node.js', tech: ['Node.js', 'Express', 'JavaScript'] },
  { key: 'python', name: 'Flask Python', description: 'Deploy Python Flask applications with zero configuration', icon: FlaskConical, framework: 'node', category: 'Python', tech: ['Python', 'Flask'] },
  { key: 'static', name: 'Static Site', description: 'A blank static HTML template', icon: FileText, framework: 'static', category: 'Static Sites', tech: ['HTML', 'CSS', 'JavaScript'] },
  { key: 'contact-form', name: 'Contact Form', description: 'A simple contact form with name, email, and message fields', icon: Mail, framework: 'vite', category: 'React', tech: ['React', 'Vite'] },
  { key: 'image-editor', name: 'Image Editor', description: 'Crop, resize, and filter images in the browser', icon: Image, framework: 'vite', category: 'React', tech: ['React', 'Canvas'] },
  { key: 'mini-game', name: 'Mini Game', description: 'A browser-based mini game built with HTML5 Canvas', icon: Gamepad2, framework: 'vite', category: 'Static Sites', tech: ['HTML5', 'Canvas', 'JavaScript'] },
  { key: 'finance-calculator', name: 'Finance Calculator', description: 'EMI, ROI, and compound interest calculator', icon: Calculator, framework: 'vite', category: 'React', tech: ['React', 'Vite'] },
  { key: 'agent', name: 'Build an agent', description: 'Deploy an agent in a minute on Vercel', icon: Bot, framework: 'vite', category: 'Node.js', tech: ['AI SDK', 'Vite'] },
  { key: 'ticket-router', name: 'Ticket router with Jev', description: 'Route ticket submissions by context using Jev and AI SDK', icon: Activity, framework: 'vite', category: 'Node.js', tech: ['Jev', 'AI SDK'] },
]

export default function Templates() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { addToast } = useToast()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      addToast('Project created from template', 'success')
      navigate('/projects')
    },
    onError: (e: any) => addToast(e.message, 'error'),
  })

  const filtered = TEMPLATES.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'All' || t.category === category
    return matchesSearch && matchesCategory
  })

  return (
    <div className="page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-white">Templates</h2>
        <p className="text-sm text-[#888888] mt-1">Browse starter templates to create and deploy new projects</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#222222] rounded-md pl-9 pr-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`
              px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition
              ${category === cat
                ? 'bg-white text-black'
                : 'bg-[#111111] text-[#888888] hover:text-white border border-[#222222]'
              }
            `}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <Rocket size={40} className="mx-auto text-[#333333] mb-3" />
          <h3 className="text-white font-medium mb-1">No templates found</h3>
          <p className="text-sm text-[#555555]">Try adjusting your search or category filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const Icon = t.icon
            return (
              <div key={t.key} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-md bg-[#111111] border border-[#222222] flex items-center justify-center">
                    <Icon size={18} className="text-white" />
                  </div>
                  <span className="text-xs text-[#555555]">{t.framework}</span>
                </div>
                <h3 className="font-semibold text-white mb-1">{t.name}</h3>
                <p className="text-xs text-[#888888] leading-relaxed mb-3 flex-1">{t.description}</p>
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                  {t.tech.map((tech) => (
                    <span key={tech} className="text-[10px] px-2 py-0.5 rounded bg-[#111111] text-[#888888] border border-[#222222]">
                      {tech}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <button
                    onClick={() => createMutation.mutate({ name: t.name, framework: t.framework, template: t.key })}
                    className="flex-1 px-3 py-1.5 text-xs bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
                  >
                    Use template
                  </button>
                  <button
                    onClick={() => addToast('Preview not available locally', 'info')}
                    className="px-3 py-1.5 text-xs bg-[#111111] text-white border border-[#222222] rounded-md hover:bg-[#1a1a1a] transition"
                  >
                    Preview
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card p-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#222222] flex items-center justify-center">
            <GitFork size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Import from Git Repository</h3>
            <p className="text-xs text-[#888888]">Clone a public GitHub repo and deploy it instantly</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="github.com/owner/repo"
            id="gh-repo-input"
            className="flex-1 bg-[#0a0a0a] border border-[#222222] rounded-md px-3 py-2 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-white transition font-mono"
          />
          <button
            onClick={() => {
              const input = document.getElementById('gh-repo-input') as HTMLInputElement
              const repo = input?.value?.trim()
              if (!repo) { addToast('Enter a GitHub repo URL', 'error'); return }
              addToast('Importing from GitHub...', 'info')
              api.post('/github', { repo }).then(() => {
                qc.invalidateQueries({ queryKey: ['projects'] })
                addToast('Imported from GitHub', 'success')
                navigate('/projects')
              }).catch((e: any) => addToast(e.message, 'error'))
            }}
            className="px-4 py-2 text-sm bg-white text-black rounded-md hover:bg-gray-200 transition font-medium"
          >
            Import & Deploy
          </button>
        </div>
      </div>
    </div>
  )
}