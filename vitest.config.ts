import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'], exclude: ['node_modules', 'e2e', '.next', 'dist'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
})
