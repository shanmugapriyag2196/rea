import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './components/ToastProvider'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import NewProject from './pages/NewProject'
import Analytics from './pages/Analytics'
import Domains from './pages/Domains'
import Usage from './pages/Usage'
import Settings from './pages/Settings'
import Deployments from './pages/Deployments'
import Logs from './pages/Logs'
import EnvVars from './pages/EnvVars'
import Templates from './pages/Templates'
import Storage from './pages/Storage'
import Integrations from './pages/Integrations'
import Observability from './pages/Observability'
import Team from './pages/Team'
import Billing from './pages/Billing'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Overview />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/new" element={<NewProject />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/deployments" element={<Deployments />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/env-vars" element={<EnvVars />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/domains" element={<Domains />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/observability" element={<Observability />} />
                <Route path="/team" element={<Team />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/usage" element={<Usage />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App