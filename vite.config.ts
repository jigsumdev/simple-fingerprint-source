import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { createGeoipMiddleware } from './server/geoip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function geoipApiPlugin(): Plugin {
  const middleware = createGeoipMiddleware()
  return {
    name: 'geoip-local-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    tailwindcss(),
    geoipApiPlugin(),
  ],
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
})
