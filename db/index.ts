import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')

// Un solo pool por proceso; en dev Next recarga módulos, así que se cuelga de globalThis.
const g = globalThis as unknown as { __rzPool?: Pool }
export const pool = g.__rzPool ?? new Pool({ connectionString: url, max: 10 })
if (process.env.NODE_ENV !== 'production') g.__rzPool = pool

export const db = drizzle(pool, { schema })
// El tipo `Db` (conexión o transacción) lo define W1 en `db/types.ts`; no exportarlo aquí.
