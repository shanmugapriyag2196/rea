import { Search, ChevronDown, Plus, GitBranch, ExternalLink, MoreHorizontal } from "lucide-react"

const projects = [
  {
    id: 1,
    name: "ai-projects",
    repo: "https://github.com/user/ai-projects",
    branch: "main",
    status: "Ready",
    statusColor: "bg-emerald-500",
    updated: "2m ago",
    by: "user",
    preview: "linear-gradient(135deg, #1a1a1a 0%, #000000 100%)",
    url: "ai-projects.vercel.app"
  },
  {
    id: 2,
    name: "dashboard-app",
    repo: "https://github.com/user/dashboard-app",
    branch: "main",
    status: "Building",
    statusColor: "bg-amber-500",
    updated: "5m ago",
    by: "user",
    preview: "linear-gradient(135deg, #0f0f0f 0%, #000000 100%)",
    url: "dashboard-app.vercel.app"
  },
  {
    id: 3,
    name: "api-service",
    repo: "https://github.com/user/api-service",
    branch: "develop",
    status: "Ready",
    statusColor: "bg-emerald-500",
    updated: "1h ago",
    by: "user",
    preview: "linear-gradient(135deg, #141414 0%, #000000 100%)",
    url: "api-service.vercel.app"
  }
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 76 65" fill="white">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              <span className="text-sm font-medium">Vercel</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/14 px-3 py-1.5 text-sm text-white/70 hover:border-white/30 hover:text-white transition-colors cursor-pointer">
              <span>Personal Account</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 rounded-md border border-white/14 px-3 py-1.5 text-sm text-white/70 hover:border-white/30 hover:text-white transition-colors">
              <Search className="h-4 w-4" />
              <span>Search...</span>
              <kbd className="ml-4 rounded border border-white/10 px-1.5 py-0.5 text-xs">⌘K</kbd>
            </button>
            <button className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-black hover:bg-white/90 transition-colors">
              <Plus className="h-4 w-4" />
              <span>Add New...</span>
            </button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-white/20 to-white/5" />
          </div>
        </div>
        {/* Sub-nav */}
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6">
          {["Overview", "Integrations", "Activity", "Domains", "Settings"].map((item, i) => (
            <button key={item} className={`relative py-3 text-sm ${i === 0 ? "text-white" : "text-white/60 hover:text-white"} transition-colors`}>
              {item}
              {i === 0 && <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-white/60">Your deployed projects and recent activity</p>
          </div>
          <button className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm text-black hover:bg-white/90 transition-colors">
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        </div>

        {/* Projects Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="group relative overflow-hidden rounded-lg border border-white/14 bg-gradient-to-b from-white/[0.02] to-transparent transition-all hover:border-white/30 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
              {/* Preview */}
              <div className="aspect-video w-full" style={{ background: project.preview }} />
              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>{project.branch}</span>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-4 w-4 text-white/60" />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${project.statusColor}`} />
                    <span className="text-sm text-white/70">{project.status}</span>
                  </div>
                  <span className="text-sm text-white/40">{project.updated} by {project.by}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <a href="#" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
                    <span>{project.url}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Git Integration */}
        <section className="mt-12">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Import Git Repository</h2>
            <p className="mt-1 text-sm text-white/60">Connect your Git provider to import and deploy projects</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { name: "GitHub", icon: "GH" },
              { name: "GitLab", icon: "GL" },
              { name: "Bitbucket", icon: "BB" },
            ].map((provider) => (
              <button key={provider.name} className="flex items-center justify-center gap-3 rounded-lg border border-white/14 bg-gradient-to-b from-white/[0.02] to-transparent p-4 hover:border-white/30 transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-sm font-medium">
                  {provider.icon}
                </div>
                <span className="font-medium">Continue with {provider.name}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
