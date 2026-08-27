import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readImage, readPdf, saveImage, savePdf } from './store'

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'rz-up-')); process.env.UPLOADS_DIR = dir })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('uploads', () => {
  it('convierte a webp ≤ 1600 px y sirve solo dentro del hogar', async () => {
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#2F9E6B' } }).png().toBuffer()
    const saved = await saveImage('h1', new Uint8Array(png))
    expect(saved.url).toMatch(/^\/api\/uploads\/h1\/[0-9a-f-]{36}\.webp$/)
    expect(saved.name).toBe(saved.path.split('/').pop())
    const buf = await readImage('h1', saved.path.split('/').pop()!)
    const meta = await sharp(buf!).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(1600)
    expect(await readImage('h2', saved.path.split('/').pop()!)).toBeNull()
    expect(await readImage('h1', '../../etc/passwd')).toBeNull()
  })
  it('rechaza bytes que no son imagen', async () => {
    await expect(saveImage('h1', new TextEncoder().encode('hola'))).rejects.toThrow()
  })
})

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n')

describe('uploads pdf', () => {
  it('guarda un PDF con extensión .pdf y lo relee', async () => {
    const saved = await savePdf('h1', PDF_BYTES)
    expect(saved.name).toMatch(/^[0-9a-f-]{36}\.pdf$/)
    expect(saved.url).toBe(`/api/uploads/h1/${saved.name}`)
    const back = await readPdf('h1', saved.name)
    expect(back?.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rechaza lo que no empieza por %PDF-', async () => {
    await expect(savePdf('h1', new TextEncoder().encode('<html>'))).rejects.toThrow()
  })

  it('readPdf no sale del directorio del hogar', async () => {
    expect(await readPdf('h1', '../../etc/passwd')).toBeNull()
    const saved = await savePdf('h1', PDF_BYTES)
    expect(await readPdf('h2', saved.name)).toBeNull()
  })
})
