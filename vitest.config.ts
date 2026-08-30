import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest (a diferencia de Next) no carga .env solo; el proyecto "db" necesita
// DATABASE_URL_TEST para levantar la conexión real. Solo esa clave: no hace
// falta filtrar el resto de .env (claves de IA, etc.) hacia el proceso de test.
// Si falta en .env, loadEnv no la incluye: dbEnv queda vacío y el spread no
// llega a poner `undefined` en process.env (que Node convertiría en la cadena
// literal "undefined" y rompería el describe.skipIf de los tests).
const { DATABASE_URL_TEST } = loadEnv('', process.cwd(), '')
const dbEnv = DATABASE_URL_TEST ? { DATABASE_URL_TEST } : {}

const DB_TEST_GLOBS = [
  'db/**/*.test.ts',
  'lib/services/**/*.test.ts',
  'lib/actions/**/*.test.ts',
  'lib/auth/**/*.test.ts',
  'lib/ai/**/*.db.test.ts',
  'lib/mcp/**/*.db.test.ts',
  'scripts/seed.test.ts',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      // Ver db/test/server-only-stub.ts: fuera de webpack, "server-only" lanza
      // siempre. Desde la Tarea 3 de W10, lib/services/** lo arrastra a través
      // de lib/cache/tags.ts, así que hace falta en los tres proyectos.
      'server-only': path.resolve(import.meta.dirname, 'db/test/server-only-stub.ts'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', 'e2e/**', '.next/**', 'dist/**', '.worktrees/**'],
    coverage: { include: ['lib/domain/**'], thresholds: { lines: 100 } },
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['**/*.test.ts'], exclude: DB_TEST_GLOBS } },
      { extends: true, test: { name: 'ui', environment: 'jsdom', include: ['**/*.test.tsx'], setupFiles: ['./vitest.setup.ts'] } },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: DB_TEST_GLOBS,
          // Los tests de este proyecto comparten una sola base de datos y la
          // truncan entre casos: correr ficheros en paralelo los pisaría entre sí.
          fileParallelism: false,
          // VITEST_PROJECT: db/test/setup.ts lo exige para no dejar que un test
          // de otro proyecto trunque la base de datos de pruebas.
          env: { ...dbEnv, VITEST_PROJECT: 'db' },
        },
      },
    ],
  },
})
