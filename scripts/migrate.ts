// scripts/migrate.ts — se ejecuta al arrancar el contenedor; sin drizzle-kit en runtime.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')
const pool = new Pool({ connectionString: url })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? './db/migrations' })
await pool.end()
console.log('migraciones aplicadas')
