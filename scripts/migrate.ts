// scripts/migrate.ts — se ejecuta al arrancar el contenedor; sin drizzle-kit en runtime.
// La implementación vive en db/migrate.ts (ver el comentario allí); este fichero
// es el punto de entrada del CLI y lo que empaqueta esbuild en dist/scripts/migrate.mjs.
import path from 'node:path'
import { runMigrations } from '@/db/migrate'

export { runMigrations }

const argv1 = process.argv[1]
const isDirectRun = argv1 !== undefined && path.basename(argv1).replace(/\.(ts|js|mjs|cjs)$/, '') === 'migrate'

if (isDirectRun) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  runMigrations(url)
    .then(() => console.log('migraciones aplicadas'))
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
}
