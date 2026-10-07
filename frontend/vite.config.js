import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En dev, "npm run dev" (puerto 5173) y el backend Spring Boot (puerto 8080) son origenes
    // distintos -- sin este proxy, httpClient.ts ("/api") y simulationSocket.ts ("/ws/simulation",
    // same-origin por diseno) le pegarian al propio Vite, no al backend. Mismo prefijo que usa
    // nginx.conf en produccion/docker, para que el codigo del cliente no tenga que saber en cual
    // de los dos entornos esta corriendo.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
