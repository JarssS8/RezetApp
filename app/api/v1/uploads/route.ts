import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'
import { MAX_UPLOAD_BYTES, saveImage } from '@/lib/uploads/store'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['recipes:write'])
    // Rechazo temprano por content-length: evita leer a memoria (formData) un
    // cuerpo ya anunciado como demasiado grande. El límite real sigue en
    // saveImage (por si el encabezado falta o miente).
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return Response.json({ error: { code: 'too_large', message: 'Máximo 8 MB' } }, { status: 413 })
    }
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return Response.json({ error: { code: 'validation', message: 'Falta el fichero' } }, { status: 400 })
    if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: { code: 'too_large', message: 'Máximo 8 MB' } }, { status: 413 })
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
