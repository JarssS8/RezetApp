// Cliente de la Edge Function de importación de ShopList (docs/06-SHOPLIST.md).
// RezetApp no modela la compra: solo empuja líneas ya consolidadas a ShopList,
// que es quien manda en su propio modelo de datos.
import { z } from 'zod'
import { toShopListItem } from '@/lib/domain/shopping'
import type { ShoppingLine } from '@/lib/domain/types'

export interface ShopListConfig {
  fnUrl: string
  secret: string
  listToken: string
}

const BATCH_SIZE = 100
const TIMEOUT_MS = 8000

// La función solo se usa para saber cuántas filas insertó; se tolera
// cualquier campo extra que ShopList decida devolver en el futuro.
const ImportResponseSchema = z.object({ inserted: z.number() })

export type ShopListErrorCode = 'network' | 'invalid'

// Error tipado para fallos HTTP de la función (status distinto de 2xx) o para
// una respuesta que no se puede interpretar. `status` es el código HTTP (0
// cuando el fetch ni siquiera llegó a responder) y `body` el texto crudo
// recibido, útil para depurar sin volver a repetir la llamada.
export class ShopListError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`ShopList: ${status} ${body}`)
    this.name = 'ShopListError'
    this.status = status
    this.body = body
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Envía las líneas a ShopList en lotes de 100 (límite de la Edge Function,
// docs/06). Nunca registra `cfg.secret`, ni en logs ni en errores.
export async function pushToShopList(
  cfg: ShopListConfig,
  lines: ShoppingLine[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ inserted: number; batches: number }> {
  const batches = chunk(lines, BATCH_SIZE)
  let inserted = 0
  for (const batch of batches) {
    const res = await fetchImpl(`${cfg.fnUrl}/import-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.secret}`,
      },
      body: JSON.stringify({
        source: 'RezetApp',
        listToken: cfg.listToken,
        items: batch.map(toShopListItem),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new ShopListError(res.status, await res.text())
    const json: unknown = await res.json()
    const parsed = ImportResponseSchema.parse(json)
    inserted += parsed.inserted
  }
  return { inserted, batches: batches.length }
}

// Enlace profundo "Abrir en ShopList" (docs/06): formato que ShopList ya usa
// para compartir listas.
export function shopListDeepLink(listToken: string): string {
  return `https://shop.jarsss8.es/#/s/${listToken}`
}
