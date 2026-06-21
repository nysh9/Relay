import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Proxy backend calls so the browser hits the Vite origin (no CORS): the Brain
  // (triage) and the standalone Redis vector-search Matchmaker (dispatch). The
  // Ear WebSocket (live transcript) is connected to directly at ws://localhost:8080.
  server: {
    proxy: {
      '/api/triage': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/triage/, '/triage'),
      },
      '/api/dispatch': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/dispatch/, '/dispatch'),
      },
      // RELAY speaks its follow-up questions aloud. The Next app's /api/speak
      // route does Deepgram Aura TTS (en/es) and returns 415 for other languages
      // so the client falls back to the browser voice. Next dev server default
      // is :3000 — override with the SPEAK target if yours runs elsewhere.
      '/api/speak': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
