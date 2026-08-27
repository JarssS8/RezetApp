import { getCurrentSession } from '@/lib/auth/guards'
import { readImage, readPdf } from '@/lib/uploads/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const [householdId, file] = (await ctx.params).path
  if (!householdId || !file || householdId !== session.household.id) return new Response('Not found', { status: 404 })
  const isPdf = file.endsWith('.pdf')
  const buf = isPdf ? await readPdf(householdId, file) : await readImage(householdId, file)
  if (!buf) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': isPdf ? 'application/pdf' : 'image/webp',
      // El nombre es un uuid: el contenido de esa URL no cambia nunca.
      'cache-control': 'private, max-age=31536000, immutable',
      // Evita que el navegador reinterprete el contenido por su cuenta
      // (p. ej. un PDF "oliendo" a HTML) ignorando el content-type declarado.
      'x-content-type-options': 'nosniff',
      // Un PDF servido en línea desde el propio origen: forzar la descarga
      // evita que el visor del navegador ejecute nada en nuestro contexto.
      ...(isPdf ? { 'content-disposition': 'attachment' } : {}),
    },
  })
}
