import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Recipient Shield frontend -- Vite + React.
// Dev server runs on 5173 and proxies /api to the FastAPI backend on 8000,
// so the frontend code can just call fetch/axios against relative "/api/..."
// URLs in both dev and production (see src/api/client.js).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
    },
  },
})
