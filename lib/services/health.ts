import { sql } from 'drizzle-orm'
import { db } from '@/db'

// Comprueba que la base de datos responde; lo usa /api/health.
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch (err) {
    console.error('health: la base de datos no responde', err)
    return false
  }
}
