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
})
