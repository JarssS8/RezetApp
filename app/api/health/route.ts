import { connection } from 'next/server'
import { pingDatabase } from '@/lib/services/health'

// No lee nada de la petición, así que sin esto Next intentaría prerenderizarla
// y pediría la conexión durante `next build` -donde no hay DATABASE_URL, ver
// docker/Dockerfile-. connection() es la sustitución documentada de
// `force-dynamic` para "esto corre en cada petición".
export async function GET(): Promise<Response> {
  await connection()
  const ok = await pingDatabase()
  return Response.json({ ok, db: ok }, { status: ok ? 200 : 503 })
}
