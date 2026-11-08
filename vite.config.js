import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createApi } from './api.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-project-api',
      configureServer(server) {
        const api = createApi(root)
        server.middlewares.use(async (req, res, next) => {
          const handled = await api(req, res)
          if (!handled) next()
        })
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5273, strictPort: false, open: false },
  build: { outDir: 'dist', emptyOutDir: true },
})
