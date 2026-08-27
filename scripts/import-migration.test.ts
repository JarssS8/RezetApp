import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMigrationArgs, readRecipeFiles } from './import-migration'

describe('parseMigrationArgs', () => {
  it('exige fichero y hogar, y reconoce --dry-run', () => {
    expect(parseMigrationArgs('mealie', ['export.json', '--household', '11111111-1111-4111-8111-111111111111'])).toEqual({
      source: 'mealie',
      path: 'export.json',
      householdId: '11111111-1111-4111-8111-111111111111',
      dryRun: false,
    })
    expect(parseMigrationArgs('tandoor', ['e.json', '--household', '11111111-1111-4111-8111-111111111111', '--dry-run']).dryRun).toBe(true)
    expect(() => parseMigrationArgs('mealie', [])).toThrow(/uso/i)
    expect(() => parseMigrationArgs('mealie', ['e.json', '--household', 'no-es-uuid'])).toThrow(/hogar/i)
  })
})

describe('readRecipeFiles', () => {
  it('lee un JSON suelto, una lista y un directorio de JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rezet-mig-'))
    await writeFile(join(dir, 'a.json'), JSON.stringify({ name: 'A' }))
    await writeFile(join(dir, 'b.json'), JSON.stringify({ name: 'B' }))
    await writeFile(join(dir, 'notas.txt'), 'ignorado')
    expect(await readRecipeFiles(dir)).toHaveLength(2)

    const single = join(dir, 'a.json')
    expect(await readRecipeFiles(single)).toEqual([{ name: 'A' }])

    const list = join(dir, 'lista.json')
    await writeFile(list, JSON.stringify([{ name: 'A' }, { name: 'B' }]))
    expect(await readRecipeFiles(list)).toHaveLength(2)
  })
})
