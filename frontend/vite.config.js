import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// For static site generation with vite-ssg:
// Run `npm run ssg` to prerender all routes to static HTML.
// For development, `npm run dev` uses normal Vite SPA mode.

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'import.meta.env.VITE_FIREBASE_CONFIG': JSON.stringify(process.env.VITE_FIREBASE_CONFIG || '{}'),
    'import.meta.env.VITE_OCM_API_KEY': JSON.stringify(process.env.VITE_OCM_API_KEY || ''),
  },

  // ─── Vitest configuration ──────────────────────────────────────────────────
  test: {
    globals: true,           // describe / it / expect available without imports
    environment: 'node',     // pure util tests — no DOM needed
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**'],
      exclude: ['src/utils/stateFeesData.js', 'src/utils/stateElectricityRates.js'],
    },
  },
})
