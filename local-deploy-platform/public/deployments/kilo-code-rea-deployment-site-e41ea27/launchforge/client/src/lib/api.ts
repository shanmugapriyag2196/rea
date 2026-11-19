const API = import.meta.env.VITE_API_URL || ''

export const api = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
  },
  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}/api${path}`, {
      method: 'POST',
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
  },
  async patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}/api${path}`, {
      method: 'PATCH',
      ...init,
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
  },
  async delete<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}/api${path}`, {
      method: 'DELETE',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
  },
  async upload<T>(path: string, file: File, query?: Record<string, string>): Promise<T> {
    const qs = query ? '?' + new URLSearchParams(query).toString() : ''
    const res = await fetch(`${API}/api${path}${qs}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/zip' },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
  },
}

export default api