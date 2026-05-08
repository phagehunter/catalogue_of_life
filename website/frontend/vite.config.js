import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is set so the app works under https://<user>.github.io/<repo>/
// In CI we set VITE_BASE_PATH=/<repo>/. For local `npm run dev` it falls back to "/".
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
}))
