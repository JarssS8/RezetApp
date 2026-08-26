// db/migrate.ts — aplica db/migrations con el migrador de drizzle-orm: no requiere
// drizzle-kit en runtime. Vive en db/ (no en scripts/) para que db/test/setup.ts
// pueda importarlo sin romper la regla de boundaries "db solo importa db";
// scripts/migrate.ts lo reexporta para el CLI y el bundle de Docker.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import { Pool } from 'pg'

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool)
  try {
    await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'db', 'migrations') })
  } finally {
    await pool.end()
  }
}
