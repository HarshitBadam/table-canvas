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
    // remaining large chunks (`charts`/recharts and `html2pdf`) are single
    // third-party libraries that cannot be subdivided further, so we raise the
    // warning threshold just enough to cover them rather than emit a warning.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split large third-party dependencies into their own chunks so no
        // single chunk balloons past the size warning threshold. Each group
        // below is a self-contained library that is safe to isolate.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@duckdb')) return 'duckdb'
          if (id.includes('/xlsx/') || id.includes('/xlsx@')) return 'xlsx'
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts'
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('reactflow') || id.includes('@reactflow') || id.includes('/dagre/') || id.includes('/graphlib/')) return 'flow'
          if (id.includes('html2canvas')) return 'html2canvas'
          if (id.includes('html2pdf')) return 'html2pdf'
          if (id.includes('/jszip/')) return 'jszip'
        },
      },
    },
  },
})
