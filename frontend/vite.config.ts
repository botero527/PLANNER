import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { createLogger, defineConfig } from 'vite'

// Cuando el backend se reinicia (uvicorn --reload) corta los websockets y Vite grita
// "ws proxy error: ECONNRESET". Es esperado: el navegador se reconecta solo. Este
// logger deja pasar todo lo demas y solo calla ese caso.
const logger = createLogger()
const errorOriginal = logger.error
logger.error = (mensaje, opciones) => {
  if (mensaje.includes('ws proxy') && mensaje.includes('ECONNRESET')) return
  errorOriginal(mensaje, opciones)
}

// En desarrollo el frontend (5190) le pasa al backend (8010) todo lo que sea /api o /ws.
// Asi el navegador cree que todo es el mismo servidor y no hay lios de CORS.
// PLN_API_URL permite apuntar a otro backend (ej: uno de pruebas en 8011) sin tocar este archivo.
const API = process.env.PLN_API_URL ?? 'http://localhost:8010'

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.PLN_PUERTO ?? 5190),
    strictPort: true,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
})
