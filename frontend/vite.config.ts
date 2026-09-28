import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// En desarrollo el frontend (5190) le pasa al backend (8010) todo lo que sea /api o /ws.
// Asi el navegador cree que todo es el mismo servidor y no hay lios de CORS.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8010',
      '/ws': { target: 'ws://localhost:8010', ws: true },
    },
  },
})
