import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

