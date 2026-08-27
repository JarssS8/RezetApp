import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readImage, saveImage } from './store'

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'rz-up-')); process.env.UPLOADS_DIR = dir })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('uploads', () => {
  it('convierte a webp ≤ 1600 px y sirve solo dentro del hogar', async () => {
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#2F9E6B' } }).png().toBuffer()
    const saved = await saveImage('h1', new Uint8Array(png))
    expect(saved.url).toMatch(/^\/api\/uploads\/h1\/[0-9a-f-]{36}\.webp$/)
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
