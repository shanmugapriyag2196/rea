import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Framework } from '../types'

export interface Template {
  key: string
  name: string
  description: string
  framework: Framework
  build_command: string | null
  install_command: string | null
  output_dir: string
  apply(targetDir: string): Promise<void>
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LaunchForge Site</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 4rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 2rem; }
    p { color: #555; }
  </style>
</head>
<body>
  <h1>Hello from LaunchForge</h1>
  <p>This static site was created from a LaunchForge template and deployed locally.</p>
</body>
</html>
`

const VITE_REACT_TEMPLATE: Record<string, string> = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LaunchForge React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`,
  'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`,
  'src/App.tsx': `import React from 'react'

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui', sans-serif', padding: '2rem' }}>
      <h1>Hello from LaunchForge React</h1>
      <p>Created from a LaunchForge template.</p>
    </div>
  )
  }
`,
  'src/App.jsx': `import React from 'react'

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui', sans-serif', padding: '2rem' }}>
      <h1>Hello from LaunchForge React</h1>
      <p>Created from a LaunchForge template.</p>
    </div>
  )
  }
`,
  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
  'package.json': JSON.stringify({
    name: 'launchforge-react-app',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.0',
      vite: '^5.4.0',
    },
  }, null, 2),
}

export class TemplateService {
  list(): Omit<Template, 'apply'>[] {
    return [
      { key: 'static', name: 'Static HTML', description: 'Plain static website', framework: 'static', build_command: null, install_command: null, output_dir: 'public' },
      { key: 'vite-react', name: 'Vite + React', description: 'React app with Vite', framework: 'vite', build_command: 'npm run build', install_command: 'npm install', output_dir: 'dist' },
      { key: 'nextjs', name: 'Next.js Boilerplate', description: 'Get started with Next.js and React in seconds', framework: 'next', build_command: 'npm run build', install_command: 'npm install', output_dir: 'out' },
      { key: 'flask', name: 'Flask Python Boilerplate', description: 'Deploy Python Flask applications with zero configuration', framework: 'node', build_command: null, install_command: 'pip install -r requirements.txt', output_dir: 'public' },
      { key: 'agent', name: 'Build an agent', description: 'Deploy an agent in a minute on Vercel', framework: 'vite', build_command: 'npm run build', install_command: 'npm install', output_dir: 'dist' },
      { key: 'ticket-router', name: 'Ticket router with Jev', description: 'Route ticket submissions by context using Jev and AI SDK', framework: 'vite', build_command: 'npm run build', install_command: 'npm install', output_dir: 'dist' },
      { key: 'analytics', name: 'Web Analytics', description: 'Track page views, events, and performance metrics', framework: 'vite', build_command: 'npm run build', install_command: 'npm install', output_dir: 'dist' },
      { key: 'speed-insights', name: 'Speed Insights', description: 'Monitor Core Web Vitals and real user metrics', framework: 'vite', build_command: 'npm run build', install_command: 'npm install', output_dir: 'dist' },
      { key: 'empty', name: 'Empty project', description: 'Start from a blank canvas', framework: 'static', build_command: null, install_command: null, output_dir: 'public' },
    ]
  }

  get(key: string): Template | null {
    const templates: Template[] = [
      {
        key: 'static',
        name: 'Static HTML',
        description: 'Plain static website',
        framework: 'static',
        build_command: null,
        install_command: null,
        output_dir: 'public',
        apply: async (targetDir: string) => {
          mkdirSync(targetDir, { recursive: true })
          writeFileSync(join(targetDir, 'index.html'), HTML_TEMPLATE)
          mkdirSync(join(targetDir, 'public'), { recursive: true })
          writeFileSync(join(targetDir, 'public', 'index.html'), HTML_TEMPLATE)
        },
      },
      {
        key: 'vite-react',
        name: 'Vite + React',
        description: 'React app with Vite',
        framework: 'vite',
        build_command: 'npm run build',
        install_command: 'npm install',
        output_dir: 'dist',
        apply: async (targetDir: string) => {
          mkdirSync(targetDir, { recursive: true })
          mkdirSync(join(targetDir, 'src'), { recursive: true })
          for (const [path, content] of Object.entries(VITE_REACT_TEMPLATE)) {
            writeFileSync(join(targetDir, path), content)
          }
        },
      },
    ]
    return templates.find((t) => t.key === key) || null
  }
}