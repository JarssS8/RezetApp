import { connection } from 'next/server'
import { getVapidPublicKey } from '@/lib/services/push'

// Pública por definición: es lo que el navegador necesita para suscribirse,
// antes incluso de saber quién es el usuario. Fuera de /api/v1 por el mismo
// motivo que el resto de rutas de este directorio.
//
// No lee nada de la petición, así que sin esto Next intentaría prerenderizarla
// y pediría la conexión durante `next build` -donde no hay DATABASE_URL, ver
// docker/Dockerfile-, igual que app/api/health/route.ts. connection() es la
// sustitución documentada de `force-dynamic` para "esto corre en cada petición".
export async function GET(): Promise<Response> {
  await connection()
  return Response.json({ publicKey: await getVapidPublicKey() })
}
