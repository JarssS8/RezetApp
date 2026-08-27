// Genera los iconos de la PWA a partir de public/icon.svg. Se ejecuta a mano
// (`pnpm build:icons`) cuando cambia el icono; los PNG se versionan para que
// el build de Docker no dependa de este paso.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const OUT = join(process.cwd(), 'public', 'icons')
// El icono "maskable" necesita margen: Android le recorta hasta un 20 % por
// lado según la forma del lanzador.
const MASKABLE_PADDING = 0.1

async function main(): Promise<void> {
  const svg = await readFile(join(process.cwd(), 'public', 'icon.svg'))
  await mkdir(OUT, { recursive: true })
  for (const size of [192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(join(OUT, `icon-${size}.png`))
  }
  const inner = Math.round(512 * (1 - 2 * MASKABLE_PADDING))
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2F9E6B' } })
    .composite([{ input: await sharp(svg).resize(inner, inner).png().toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(join(OUT, 'maskable-512.png'))
  await writeFile(join(process.cwd(), 'public', 'apple-touch-icon.png'), await sharp(svg).resize(180, 180).png().toBuffer())
  console.log('iconos generados en public/icons')
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
