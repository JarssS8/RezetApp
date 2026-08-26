import 'server-only'

// Evita que un body no-JSON (o vacío) tire un 500: los handlers comprueban
// null y devuelven 400 validation en lugar de dejar que request.json() lance.
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
