import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import type { Db } from './types'

// Un solo pool por proceso; en dev Next recarga módulos, así que se cuelga de globalThis.
const g = globalThis as unknown as { __rzPool?: Pool }

let cached: Db | undefined

// Crea el pool y el cliente de Drizzle en el primer uso: importar este módulo
// no debe fallar si DATABASE_URL no está definida todavía (p. ej. en `next build`).
export function getDb(): Db {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida')
  const pool = g.__rzPool ?? new Pool({ connectionString: url, max: 10 })
  if (process.env.NODE_ENV !== 'production') g.__rzPool = pool
  cached = drizzle(pool, { schema })
  return cached
}

// Proxy perezoso: cada acceso a una propiedad delega en getDb(), que solo crea
// el pool la primera vez. Permite seguir escribiendo `db.execute(...)` en los
// servicios sin forzar la conexión al importar el módulo.
export const db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(getDb() as object, prop, getDb()),
})
