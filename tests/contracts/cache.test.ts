import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de caché de W10. Vale tanto por lo que exige (cada función
// cacheada con su hogar en la clave, cada escritura con su invalidación)
// como por lo que prohíbe (el temporizador ciego que sustituye).
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('configuración de caché', () => {
  it('Cache Components está activado y staleTimes retirado', () => {
    const config = read('next.config.ts')
    expect(config).toContain('cacheComponents: true')
    // El parche de 0f8757d: cacheaba cualquier segmento 30 s sin saber si los
    // datos habían cambiado. Lo sustituye el `stale` del perfil `household`.
    expect(config).not.toContain('staleTimes')
  })

  it('define un único perfil de vida con stale de 30 s', () => {
    const config = read('next.config.ts')
    // 30 s es el mínimo que cacheLife.md exige para que un prefetch siga
    // siendo utilizable, y reproduce exactamente el staleTimes.dynamic que se
    // retira: la oleada cambia el mecanismo, no el comportamiento percibido.
    expect(config).toMatch(/cacheLife:\s*\{\s*household:\s*\{\s*stale:\s*30\b/)
  })

  it('ningún segmento exporta ya dynamic, revalidate ni fetchCache', () => {
    // Con cacheComponents puesto, un segmento que los exporte da error de build.
    for (const file of [
      'app/api/health/route.ts',
      'app/api/events/route.ts',
      'app/api/uploads/[...path]/route.ts',
      'app/mcp/route.ts',
    ]) {
      expect(read(file), file).not.toMatch(/export const (dynamic|revalidate|fetchCache)\b/)
    }
  })

  it('la ruta de salud difiere a tiempo de petición en vez de forzar dinamismo', () => {
    // Sin esto, `next build` intentaría prerenderizarla, pingDatabase pediría
    // la conexión y la etapa `build` del Dockerfile (sin DATABASE_URL) caería.
    const health = read('app/api/health/route.ts')
    expect(health).toContain("from 'next/server'")
    expect(health).toContain('await connection()')
  })

  it('la validación de armazón estático se desactiva en un solo sitio y con motivo', () => {
    const rootLayout = read('app/layout.tsx')
    expect(rootLayout).toContain('export const instant = false')
    // No en cinco layouts: en el raíz, que es el que de verdad bloquea (lee la
    // cookie de preferencias para pintar data-theme en el <html>).
    for (const file of ['app/(app)/layout.tsx', 'app/(auth)/layout.tsx', 'app/(app)/settings/layout.tsx']) {
      expect(read(file), file).not.toContain('instant')
    }
  })
})
