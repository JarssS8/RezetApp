import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'
import { MAX_UPLOAD_BYTES, saveImage } from '@/lib/uploads/store'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return Response.json({ error: { code: 'validation', message: 'Falta el fichero' } }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: { code: 'validation', message: 'Máximo 8 MB' } }, { status: 413 })
    try {
      const saved = await saveImage(ctx.householdId, new Uint8Array(await file.arrayBuffer()))
      return Response.json({ url: saved.url }, { status: 201 })
    } catch {
      return Response.json({ error: { code: 'validation', message: 'No es una imagen válida' } }, { status: 400 })
    }
  } catch (e) {
    return apiErrorResponse(e)
  }
}
