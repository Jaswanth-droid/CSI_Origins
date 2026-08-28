import { useEffect, useState, useCallback } from 'react'

// Tiny dependency-free hash router. The brief's stack list (React, Vite,
// Tailwind, Recharts, Axios) doesn't include react-router, and this app
// only has a handful of screens, so a ~20-line hash-based router keeps
// things simple (per hackathon brief section 19: don't over-engineer)
// while still giving every screen a real, shareable, back-button-friendly
// URL like #/transfer or #/analytics.
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard'
  const [path, query] = raw.split('?')
  const params = Object.fromEntries(new URLSearchParams(query || ''))
  return { path: path || '/dashboard', params }
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    window.location.hash = `#${path}${qs}`
  }, [])

  return { ...route, navigate }
}
