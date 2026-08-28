import axios from 'axios'

// Relative base -- Vite's dev server proxies /api to the FastAPI backend
// (see vite.config.js). In production, serve the built frontend from the
// same origin as the API (or set up your own reverse proxy) so this
// relative path keeps working unchanged.
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rs_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('rs_token')
      localStorage.removeItem('rs_user')
      if (!window.location.hash.startsWith('#/login')) {
        window.location.hash = '#/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
