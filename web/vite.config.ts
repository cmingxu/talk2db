import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../webui/dist',
    emptyOutDir: true,
    target: ['chrome90'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
