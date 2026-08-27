import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 1600
// Límite de píxeles de entrada (ancho × alto) antes de decodificar: evita
// bombas de descompresión (un PNG minúsculo que se expande a gigapíxeles).
const MAX_INPUT_PIXELS = 100_000_000
const FILE_RE = /^[0-9a-f-]{36}\.webp$/
// Los ids reales de hogar son uuid; el propio test de la despensa temporal usa 'h1'/'h2'.
const HOUSEHOLD_ID_RE = /^[A-Za-z0-9-]{1,64}$/

export function uploadsDir(): string {
  // turbopackIgnore: la ruta depende de una variable de entorno, no de un
  // fichero del propio proyecto; sin este aviso Next traza el proyecto
  // entero al construir las rutas que la usan (ver output: 'standalone').
  return resolve(/* turbopackIgnore: true */ process.env.UPLOADS_DIR ?? './data/uploads')
}

// Guarda la imagen como webp (máx. 1600 px de lado) bajo el hogar. Lanza si los bytes no son una imagen.
export async function saveImage(householdId: string, bytes: Uint8Array): Promise<{ path: string; url: string }> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error('Imagen demasiado grande')
  const webp = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()
  const name = `${randomUUID()}.webp`
  const dir = join(uploadsDir(), householdId)
  await mkdir(dir, { recursive: true, mode: 0o750 })
  const path = join(dir, name)
  await writeFile(path, webp)
  return { path, url: `/api/uploads/${householdId}/${name}` }
}

export async function readImage(householdId: string, file: string): Promise<Buffer | null> {
  if (!FILE_RE.test(file) || !HOUSEHOLD_ID_RE.test(householdId)) return null
  const base = uploadsDir()
  const path = resolve(base, householdId, file)
  // Doble comprobación aparte de las regex anteriores: el path resuelto debe
  // seguir dentro del directorio de subidas (defensa en profundidad contra
  // path traversal si alguna vez cambian las expresiones de arriba).
  if (path !== join(base, householdId, file)) return null
  try {
    return await readFile(path)
  } catch {
    return null
  }
}
