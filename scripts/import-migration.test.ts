import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Ctx } from '@/lib/services/ctx'
import { normalizeTitle, parseMigrationArgs, readRecipeFiles, runMigration, type MigrationDeps } from './import-migration'

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111'

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

// Dos recetas válidas de Mealie y una que el mapeador descartará (sin pasos).
async function fixtureDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rezet-run-'))
  const ok = (name: string) => ({ name, recipeIngredient: [{ note: '200 g de arroz' }], recipeInstructions: [{ text: 'Cuece' }] })
  await writeFile(join(dir, 'a.json'), JSON.stringify(ok('Arroz')))
  await writeFile(join(dir, 'b.json'), JSON.stringify(ok('Lentejas')))
  await writeFile(join(dir, 'c.json'), JSON.stringify({ name: 'Rota' }))
  return dir
}

describe('runMigration', () => {
  it('una receta que falla no se lleva por delante a las demás', async () => {
    const dir = await fixtureDir()
    const create = vi.fn(async (_ctx: Ctx, input: { title: string }) => {
      if (input.title === 'Arroz') throw new Error('boom')
      return {}
    })
    const deps: MigrationDeps = { create: create as MigrationDeps['create'], existingTitles: async () => new Set() }

    const result = await runMigration({ source: 'mealie', path: dir, householdId: HOUSEHOLD, dryRun: false }, deps)

    expect(create).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ created: 1, skipped: 1, duplicated: 0, failed: ['Arroz'] })
  })

  it('repetir la migración no duplica: lo que ya está se cuenta aparte', async () => {
    const dir = await fixtureDir()
    const create = vi.fn(async () => ({}))
    const deps: MigrationDeps = {
      create: create as MigrationDeps['create'],
      existingTitles: async () => new Set([normalizeTitle('  ARROZ  ')]),
    }

    const result = await runMigration({ source: 'mealie', path: dir, householdId: HOUSEHOLD, dryRun: false }, deps)

    expect(create).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ created: 1, skipped: 1, duplicated: 1, failed: [] })
  })

  it('con --dry-run no llama a crear ni consulta lo que ya existe', async () => {
    const dir = await fixtureDir()
    const create = vi.fn(async () => ({}))
    const existingTitles = vi.fn(async () => new Set<string>())
    const deps: MigrationDeps = { create: create as MigrationDeps['create'], existingTitles }

    const result = await runMigration({ source: 'mealie', path: dir, householdId: HOUSEHOLD, dryRun: true }, deps)

    expect(create).not.toHaveBeenCalled()
    expect(existingTitles).not.toHaveBeenCalled()
    expect(result).toEqual({ created: 0, skipped: 1, duplicated: 0, failed: [] })
  })
})

describe('normalizeTitle', () => {
  it('ignora mayúsculas, espacios de sobra y acentos', () => {
    expect(normalizeTitle('  Lentejas   Estofadas ')).toBe(normalizeTitle('lentejas estofadas'))
    expect(normalizeTitle('Pisto Manchego')).toBe(normalizeTitle('pisto manchego'))
  })
})
