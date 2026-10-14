import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` is the public path. CI sets VITE_BASE_PATH=/<repo>/ so the site
// works under https://<user>.github.io/<repo>/ (and a custom domain that
// keeps the same path). Local dev falls back to "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
})
