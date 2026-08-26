import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    exclude: ['**/node_modules/**', 'e2e/**', '.next/**', 'dist/**'],
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['**/*.test.ts'] } },
      { extends: true, test: { name: 'ui', environment: 'jsdom', include: ['**/*.test.tsx'], setupFiles: ['./vitest.setup.ts'] } },
    ],
  },
})
