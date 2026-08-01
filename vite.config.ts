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

// https://vite.dev/config/
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
    // Real chunk splitting below keeps most vendor code well isolated. The
    // largest remaining chunk is `pdfmake` — the PDF engine plus the embedded
    // Roboto font data it needs for accented and Cyrillic text — a single
    // third-party bundle that cannot be subdivided and is only fetched when a
    // report is exported. The threshold is raised just enough to cover it rather
    // than emit a warning on every build.
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        // Split large third-party dependencies into their own chunks so no
        // single chunk balloons past the size warning threshold. Each group
        // below is a self-contained library that is safe to isolate.
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
