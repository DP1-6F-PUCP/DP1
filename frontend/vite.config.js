import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('leaflet')) return 'leaflet';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
          if (id.includes('lucide-react') || id.includes('react-icons')) return 'icons';
          if (id.includes('react') || id.includes('react-dom')) return 'react';
          if (id.includes('@tanstack') || id.includes('zustand')) return 'state';
          return 'vendor';
        },
      },
    },
  },
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
