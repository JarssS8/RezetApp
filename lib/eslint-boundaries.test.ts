// Prueba de humo de eslint.config.mjs: confirma que las reglas de boundaries
// y la pureza de lib/domain se aplican sobre ficheros sintéticos, sin tocar
// el código real del repo.
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const cwd = path.resolve(import.meta.dirname, '..')
const eslint = new ESLint({ cwd, overrideConfigFile: path.join(cwd, 'eslint.config.mjs') })

async function lint(filePath: string, code: string) {
  const results = await eslint.lintText(code, { filePath: path.join(cwd, filePath) })
  const result = results[0]
  if (!result) throw new Error(`eslint no devolvió resultado para ${filePath}`)
  return result
}

describe('eslint.config.mjs: boundaries', () => {
  it('lib/domain no puede importar react', async () => {
    const result = await lint('lib/domain/probe.ts', "import x from 'react'\nexport const y = x\n")
    expect(result.errorCount).toBeGreaterThan(0)
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true)
  })

  it('lib/domain no puede importar @/db', async () => {
    const result = await lint('lib/domain/probe.ts', "import { db } from '@/db'\nexport const y = db\n")
    expect(result.messages.some((m) => m.ruleId?.startsWith('boundaries/'))).toBe(true)
  })

  it('lib/uploads no puede importar @/db', async () => {
    const result = await lint('lib/uploads/probe.ts', "import { db } from '@/db'\nexport const y = db\n")
    expect(result.messages.some((m) => m.ruleId?.startsWith('boundaries/'))).toBe(true)
  })

  it('un fichero suelto en lib/ no puede importar @/db', async () => {
    const result = await lint('lib/probe.ts', "import { db } from '@/db'\nexport const y = db\n")
    expect(result.messages.some((m) => m.ruleId?.startsWith('boundaries/'))).toBe(true)
  })

  it('app/ no puede importar @/db directamente', async () => {
    const result = await lint(
      'app/probe/page.tsx',
      "import { db } from '@/db'\nexport default function P() { return db }\n",
    )
    expect(result.messages.some((m) => m.ruleId?.startsWith('boundaries/'))).toBe(true)
  })

  it('components/ no puede importar lib/services', async () => {
    const result = await lint(
      'components/probe.tsx',
      "import { pingDatabase } from '@/lib/services/health'\nexport default function C() { return pingDatabase }\n",
    )
    expect(result.messages.some((m) => m.ruleId?.startsWith('boundaries/'))).toBe(true)
  })

  it('app/ sí puede importar lib/services', async () => {
    const result = await lint(
      'app/probe/page.tsx',
      "import { pingDatabase } from '@/lib/services/health'\nexport default function P() { return pingDatabase }\n",
    )
    expect(result.messages.filter((m) => m.ruleId?.startsWith('boundaries/'))).toHaveLength(0)
  })
})
