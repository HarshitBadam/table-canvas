import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const DUCKDB_DIST = path.resolve(__dirname, 'node_modules/@duckdb/duckdb-wasm/dist')
const DUCKDB_FILES = [
  'duckdb-mvp.wasm',
  'duckdb-eh.wasm',
  'duckdb-coi.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-browser-eh.worker.js',
  'duckdb-browser-coi.worker.js',
  'duckdb-browser-coi.pthread.worker.js',
]

function duckdbLocalBundlePlugin(): Plugin {
  return {
    name: 'vite-plugin-duckdb-local',

    configureServer(server) {
      server.middlewares.use('/duckdb', (req, res, next) => {
        const filename = (req.url || '').replace(/^\//, '').split('?')[0]
        if (!DUCKDB_FILES.includes(filename)) return next()
        const filePath = path.join(DUCKDB_DIST, filename)
        if (!fs.existsSync(filePath)) return next()
        res.setHeader(
          'Content-Type',
          filename.endsWith('.wasm') ? 'application/wasm' : 'application/javascript',
        )
        fs.createReadStream(filePath).pipe(res)
      })
    },

    generateBundle() {
      for (const file of DUCKDB_FILES) {
        const src = path.join(DUCKDB_DIST, file)
        if (fs.existsSync(src)) {
          this.emitFile({
            type: 'asset',
            fileName: `duckdb/${file}`,
            source: fs.readFileSync(src),
          })
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), duckdbLocalBundlePlugin()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    // pdfmake embeds Roboto font data for accented/Cyrillic text and cannot be
    // subdivided; raise the warning threshold to cover that on-demand chunk.
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('commonjsHelpers')) return 'vendor-runtime'
          if (!id.includes('node_modules')) return
          if (id.includes('@duckdb')) return 'duckdb'
          if (id.includes('/xlsx/') || id.includes('/xlsx@')) return 'xlsx'
          if (id.includes('/pdfmake/') || id.includes('/pdfmake@')) return 'pdfmake'
        },
      },
    },
  },
})
