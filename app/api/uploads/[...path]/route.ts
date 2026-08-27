import { getCurrentSession } from '@/lib/auth/guards'
import { readImage } from '@/lib/uploads/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const [householdId, file] = (await ctx.params).path
  if (!householdId || !file || householdId !== session.household.id) return new Response('Not found', { status: 404 })
  const buf = await readImage(householdId, file)
  if (!buf) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(buf), {
    headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=31536000, immutable' },
  })
}
