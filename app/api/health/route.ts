import { pingDatabase } from '@/lib/services/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ok = await pingDatabase()
  return Response.json({ ok, db: ok }, { status: ok ? 200 : 503 })
}
