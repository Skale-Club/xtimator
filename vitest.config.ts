import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    alias: {
      '@': path.resolve(__dirname, '.'),
      // server-only throws when imported from a client bundle (vitest runs jsdom = client-ish).
      // In tests we always exercise server modules in isolation, so alias to the empty stub
      // that Next.js ships for server-only (same as the react-server resolution path).
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
})
