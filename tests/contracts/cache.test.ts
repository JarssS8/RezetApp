import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de caché de W10. Vale tanto por lo que exige (cada función
// cacheada con su hogar en la clave, cada escritura con su invalidación)
// como por lo que prohíbe (el temporizador ciego que sustituye).
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

// Recorre `dir` recursivamente y devuelve rutas relativas a ROOT de los
// .ts/.tsx que no sean tests.
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true })
    .filter((f): f is string => typeof f === 'string')
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .map((f) => join(dir, f))
}

const CACHE_DIR = 'lib/cache'
const cacheFiles = () => readdirSync(join(ROOT, CACHE_DIR)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

// Toda función que abre un ámbito de caché, con su firma.
function cachedFunctions(source: string): { name: string; signature: string; body: string }[] {
  const out: { name: string; signature: string; body: string }[] = []
  const re = /export async function (\w+)\(([^)]*)\)[^{]*\{\s*'use cache'([\s\S]*?)(?=\nexport |\n$)/g
  for (const m of source.matchAll(re)) out.push({ name: m[1] as string, signature: m[2] as string, body: m[3] as string })
  return out
}

describe('forma de las funciones cacheadas', () => {
  it('"use cache" solo existe bajo lib/cache', () => {
    // Cachear interfaz (una página, un componente) mezclaría datos del hogar
    // con datos del usuario -units, displayName, role- en la misma entrada:
    // es exactamente la fuga que esta oleada existe para impedir.
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')]
      .filter((f) => !f.startsWith('lib/cache/'))
      .filter((f) => read(f).includes("'use cache'"))
    expect(offenders).toEqual([])
  })

  it('cada función cacheada lleva el hogar y el idioma en la clave', () => {
    for (const file of cacheFiles()) {
      for (const fn of cachedFunctions(read(`${CACHE_DIR}/${file}`))) {
        // Sin excepciones: dos entradas por hogar (es/en) cuestan menos que
        // discutir caso por caso si una salida está localizada.
        expect(fn.signature.replace(/\s+/g, ' '), `${file}::${fn.name}`).toMatch(/^householdId: string, locale: Locale\b/)
        // Un Ctx no es clave de caché: lleva `db` (un Proxy) y la sesión.
        expect(fn.signature, `${file}::${fn.name}`).not.toContain('Ctx')
      }
    }
  })

  it('cada función cacheada declara vida y etiquetas construidas, no literales', () => {
    for (const file of cacheFiles()) {
      for (const fn of cachedFunctions(read(`${CACHE_DIR}/${file}`))) {
        expect(fn.body, `${file}::${fn.name}`).toContain("cacheLife('household')")
        expect(fn.body, `${file}::${fn.name}`).toContain('cacheTag(householdTag(householdId,')
        expect(fn.body, `${file}::${fn.name}`).not.toMatch(/cacheTag\(\s*['"`]/)
      }
    }
  })

  it('la capa de caché no lee la petición', () => {
    // cookies()/headers() dentro de "use cache" lanzan (next-request-in-use-cache),
    // y en una ruta dinámica el fallo no aparece hasta que se ejecuta: pasaría
    // el build y se caería en producción. Mejor que no entre nunca.
    for (const file of cacheFiles()) {
      const source = read(`${CACHE_DIR}/${file}`)
      expect(source, file).not.toContain('next/headers')
      expect(source, file).not.toContain('requireHousehold')
      expect(source, file).not.toContain('getCurrentSession')
    }
  })

  it('tags.ts no importa de services: la frontera cache <-> services no es un ciclo real', () => {
    expect(read('lib/cache/tags.ts')).not.toContain('@/lib/services')
  })
})

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

// La tabla de escritura -> etiquetas del plan de W10, en código. Cada entrada
// es una función de servicio que escribe datos del hogar y los ámbitos que
// tiene que caducar. Añadir una escritura sin fila aquí es lo que este
// contrato existe para impedir.
const WRITES: [file: string, fn: string, scopes: string[]][] = [
  ['lib/services/pantry.ts', 'upsertPantryItem', ['pantry']],
  ['lib/services/pantry.ts', 'adjustPantryItem', ['pantry']],
  ['lib/services/pantry.ts', 'removePantryItem', ['pantry']],
  ['lib/services/recipes.ts', 'createRecipe', ['recipes', 'foods']],
  ['lib/services/recipes.ts', 'updateRecipe', ['recipes', 'foods', 'plan']],
  ['lib/services/recipes.ts', 'softDeleteRecipe', ['recipes', 'plan']],
  ['lib/services/recipes.ts', 'importAll', ['recipes', 'foods']],
  ['lib/services/foods.ts', 'createFood', ['foods']],
  ['lib/services/foods.ts', 'correctFood', ['foods', 'recipes', 'pantry']],
  ['lib/services/foods.ts', 'mergeFoods', ['foods', 'recipes', 'pantry']],
  ['lib/services/foods.ts', 'lookupBarcode', ['foods']],
  ['lib/services/plan.ts', 'applyBatch', ['plan']],
  ['lib/services/plan.ts', 'createProposal', ['plan']],
  ['lib/services/plan.ts', 'decideProposal', ['plan']],
  ['lib/services/plan.ts', 'moveEntry', ['plan']],
  ['lib/services/plan.ts', 'patchEntry', ['plan']],
  ['lib/services/plan.ts', 'createLeftover', ['plan']],
  ['lib/services/cooking.ts', 'logCooked', ['plan', 'pantry', 'recipes']],
  ['lib/services/collections.ts', 'createCollection', ['recipes']],
  ['lib/services/collections.ts', 'deleteCollection', ['recipes']],
  ['lib/services/households.ts', 'updateHousehold', ['settings']],
  ['lib/services/households.ts', 'createInvite', ['settings']],
  ['lib/services/households.ts', 'acceptInvite', ['settings']],
  ['lib/services/households.ts', 'leaveHousehold', ['settings']],
  ['lib/services/households.ts', 'deleteHousehold', ['settings']],
  ['lib/services/members.ts', 'updateMember', ['settings']],
  ['lib/services/members.ts', 'removeMember', ['settings']],
  ['lib/services/plan-rules.ts', 'updatePlanRules', ['settings']],
  ['lib/services/ai-settings.ts', 'updateAiSettings', ['settings']],
  ['lib/services/shoplist-settings.ts', 'updateShoplistSettings', ['settings']],
  ['lib/services/shopping.ts', 'pushShopping', ['settings']],
]

// Cuerpo de una función exportada: desde su cabecera hasta la siguiente
// declaración exportada del fichero (o el final).
function bodyOf(source: string, fn: string): string {
  const start = source.indexOf(`export async function ${fn}(`)
  expect(start, `no existe ${fn}`).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const end = rest.indexOf('\nexport ')
  return end === -1 ? rest : rest.slice(0, end)
}

describe('invalidación', () => {
  it('cada escritura de hogar menciona sus ámbitos', () => {
    for (const [file, fn, scopes] of WRITES) {
      const body = bodyOf(read(file), fn)
      expect(body, `${file}::${fn}`).toContain('invalidateHousehold(')
      for (const scope of scopes) expect(body, `${file}::${fn} -> ${scope}`).toContain(`'${scope}'`)
    }
  })

  it('donde había un evento SSE hay también una invalidación', () => {
    // Las dos líneas son la misma idea para dos públicos: el evento avisa a
    // las pantallas abiertas, la etiqueta avisa a la caché. Que no se separen.
    for (const file of ['pantry', 'recipes', 'plan', 'cooking', 'foods'].map((f) => `lib/services/${f}.ts`)) {
      const source = read(file)
      const emits = source.split('emitHouseholdEvent(').length - 1
      const invalidations = source.split('invalidateHousehold(').length - 1
      expect(invalidations, file).toBeGreaterThanOrEqual(emits)
    }
  })

  it('revalidateTag solo se escribe en lib/cache/tags.ts, y updateTag en ninguna parte', () => {
    for (const file of [...WRITES.map(([f]) => f), 'lib/actions/plan.ts', 'lib/actions/pantry.ts', 'lib/actions/recipes.ts']) {
      expect(read(file), file).not.toContain('revalidateTag')
      expect(read(file), file).not.toContain('updateTag')
    }
  })

  it('revalidatePath sobrevive solo en las dos líneas del marco', () => {
    // Ninguna de las dos invalida datos de hogar: refrescan el layout que se
    // deriva de la cookie de preferencias (tema, idioma) y del hogar activo.
    const settings = read('lib/actions/settings.ts')
    expect(settings.split("revalidatePath('/', 'layout')").length - 1).toBe(2)
    for (const file of ['pantry', 'recipes', 'plan', 'plan-rules', 'cooking', 'foods', 'collections', 'shopping', 'ai']) {
      expect(read(`lib/actions/${file}.ts`), file).not.toContain('revalidatePath')
    }
  })
})

// Las pantallas que leen datos del hogar tienen que leerlos por la capa de
// caché. Las excepciones son estas y no hay más:
const UNCACHED_PAGES: Record<string, string> = {
  // Ajustes: tráfico bajo y datos por usuario mezclados con los del hogar
  // (passkeys, tokens, apariencia). Cachearlos daría una clave por usuario
  // dentro de un ámbito de hogar, que es justo lo que este contrato prohíbe.
  'app/(app)/settings/household/page.tsx': 'ajustes: no se cachea (ver plan W10, "Fuera de alcance")',
  'app/(app)/settings/members/page.tsx': 'ajustes: no se cachea',
  'app/(app)/settings/ai/page.tsx': 'ajustes: el gasto del mes se agrega con now() en Postgres',
  'app/(app)/settings/shoplist/page.tsx': 'ajustes: no se cachea',
  'app/(app)/settings/tokens/page.tsx': 'por usuario, no por hogar',
  'app/(app)/settings/passkeys/page.tsx': 'por usuario, no por hogar',
  'app/(app)/settings/appearance/page.tsx': 'por usuario: sale de ctx.session, sin consulta',
  'app/(app)/settings/notifications/page.tsx': 'por usuario, no por hogar',
  // La invitación se resuelve por token y sin sesión: no hay hogar del que
  // extraer una clave, y el destinatario aún no es miembro de ninguno.
  'app/(auth)/invite/[token]/page.tsx': 'sin sesión: la clave sería el token, no el hogar',
  // Igual que la invitación: todavía no hay sesión ni hogar. registrationOpen
  // agrega si el registro está abierto en general (env/config), no un dato de hogar.
  'app/(auth)/register/page.tsx': 'sin sesión: registrationOpen es un ajuste global, no de hogar',
  // Estas tres importan de lib/services, pero no para leer datos del hogar:
  // el detalle de receta ya llega cacheado (getRecipeCached / getProposals) y
  // lo que se trae de services es una función pura o un tipo, sin consulta.
  'app/(app)/cook/recipe/[id]/page.tsx': 'solo importa hourInHouseholdTz (función pura Date+huso); la receta llega de getRecipeCached',
  'app/(app)/recipes/[id]/edit/page.tsx': 'solo importa detailToInput (mapeo puro, sin consulta); la receta llega de getRecipeCached',
  'app/(app)/plan/proposals/page.tsx': 'solo importa el tipo ProposalView (import type, sin huella en tiempo de ejecución)',
}

describe('cobertura de la caché', () => {
  it('ninguna pantalla llama a un servicio de lectura por su cuenta', () => {
    const pages = walk('app').filter((f) => f.endsWith('page.tsx'))
    for (const page of pages) {
      if (page in UNCACHED_PAGES) continue
      const source = read(page)
      // Los servicios se importan desde lib/cache; una página que los importe
      // directamente se está saltando la caché (y con ella la invalidación).
      expect(source, `${page}: si es a propósito, añádelo a UNCACHED_PAGES con el motivo`).not.toMatch(/from '@\/lib\/services\//)
    }
  })

  it('cada excepción tiene su motivo escrito', () => {
    for (const [page, reason] of Object.entries(UNCACHED_PAGES)) {
      expect(reason.length, page).toBeGreaterThan(20)
    }
  })

  it('las funciones cacheadas son exportadas de módulo, nunca anidadas', () => {
    // Una función cacheada declarada dentro de otra captura el ámbito exterior,
    // y lo capturado entra en la clave (use-cache.md, "Cache keys"): un `ctx`
    // capturado sin querer intentaría serializar la conexión a Postgres.
    for (const file of cacheFiles()) {
      const source = read(`${CACHE_DIR}/${file}`)
      for (const line of source.split('\n')) {
        if (!line.includes("'use cache'")) continue
        expect(line, `${file}: "use cache" con más de dos niveles de sangría`).toMatch(/^ {2}'use cache'$/)
      }
    }
  })

  it('la capa de caché no escribe', () => {
    for (const file of cacheFiles()) {
      if (file === 'tags.ts') continue
      const source = read(`${CACHE_DIR}/${file}`)
      // revalidate dentro de un "use cache" lanza (E181). Y un servicio de
      // escritura dentro de una lectura cacheada sería peor todavía.
      expect(source, file).not.toContain('invalidateHousehold')
      expect(source, file).not.toMatch(/\b(upsert|update|create|delete|remove|log)[A-Z]\w*\(cacheCtx/)
    }
  })

  it('todos los ámbitos declarados tienen al menos un lector y un escritor', () => {
    // Un ámbito sin lector es una etiqueta que no invalida nada; uno sin
    // escritor es una entrada que no caduca nunca. Los dos son bugs callados.
    const readers = cacheFiles().map((f) => read(`${CACHE_DIR}/${f}`)).join('\n')
    const writers = WRITES.map(([file]) => file).filter((f, i, a) => a.indexOf(f) === i).map(read).join('\n')
    for (const scope of ['recipes', 'plan', 'pantry', 'foods', 'settings']) {
      expect(readers, `ámbito ${scope} sin lector`).toContain(`'${scope}')`)
      expect(writers, `ámbito ${scope} sin escritor`).toContain(`'${scope}'`)
    }
  })
})
