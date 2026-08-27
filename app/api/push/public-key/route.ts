import { db, getVapidPublicKey } from '@/lib/services/push'

// Pública por definición: es lo que el navegador necesita para suscribirse,
// antes incluso de saber quién es el usuario. Fuera de /api/v1 por el mismo
// motivo que el resto de rutas de este directorio.
export async function GET(): Promise<Response> {
  return Response.json({ publicKey: await getVapidPublicKey(db) })
}
