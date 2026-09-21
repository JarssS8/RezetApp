# Nutrición personal (fase 2) — plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Pasos con checkbox (`- [ ]`). Ejecuta las tareas **en orden**: cada una asume la anterior commiteada.

**Goal:** Que el anillo de Hoy cuente **lo que ha comido cada persona**, no lo que ha cocinado el hogar: objetivo propio calculado con Mifflin-St Jeor, comidas del plan a una ración ajustable, y extras registrados a mano, por receta o por código de barras.

**Architecture:** Tres tablas nuevas colgando de `member` (`member_body` privada por cuenta, `intake_share` para las excepciones al "1 ración", `intake_extra` para lo que se come fuera del plan), dos módulos puros en `domain/` que concentran toda la aritmética, y una RPC `finish_cook_v2` que escribe las raciones dentro de la misma transacción que descuenta la despensa. El valor por defecto es implícito: cocinar suma a todos sin escribir ninguna fila, y solo la excepción ocupa espacio.

**Tech Stack:** Supabase (Postgres + RLS), React 19 + TypeScript + Vite, TanStack Query, vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-09-20-personalizacion-por-miembro-design.md` §6 (y §3.2 para el predicado de privacidad). Léela: este plan argumenta desde ella.

## Estado de partida

La fase 1 está desplegada (1.9.0). Ya existen: la tabla `member` (con `is_ward`, `deleted_at`, `kcal_target` con `check` 1000-5000), el predicado `private.can_act_for(uuid)` —**úsalo, no reimplementes sus condiciones**—, las RPC `create_ward_member` / `delete_ward_member` / `set_member_settings`, el contrato `Store` con `members` y `myMemberId`, los tipos marcados `MemberId` / `ProfileId`, y `Today.tsx` comparando ya contra el objetivo del miembro propio.

## Desviación respecto de la spec, decidida y justificada

Una, y ninguna más. Si encuentras otra, **para y repórtalo**.

**La spec §6.1 dice que `set_member_body` "recalcula y escribe `member.kcal_target` en la misma transacción".** Aquí no: la RPC **recibe** el objetivo ya calculado como parámetro. Motivo: implementar Mifflin-St Jeor en PL/pgSQL duplicaría una regla de negocio que, por regla no negociable del repo, vive en `domain/` y solo ahí — y dos copias de una fórmula divergen. El cliente calcula con `domain/nutrition.ts` y manda el número; la base de datos sigue validando el rango con su `check`.

## Global Constraints

- **Ninguna tarea toca producción:** nada de `mcp__supabase__apply_migration`, `supabase db push`, `wrangler`, `supabase functions deploy`, ni `git push`. Solo ficheros y commits locales.
- **Prefijo de migración** `YYYYMMDDHHMMSS`, mayor que `20260920090500`. Usa los nombres de fichero **exactos** de cada tarea.
- **Toda función SQL nueva:** `set search_path = ''`, tablas como `public.<tabla>`, `revoke all on function … from public, anon;` y el `grant execute` que toque. Toda RPC que reciba un `p_member_id` **empieza** comprobando `private.can_act_for(p_member_id)`.
- **Grants por columna:** `revoke update on <tabla> from authenticated;` primero, `grant update (col, …)` después.
- **Las reglas de negocio viven en `domain/`**, puras y testeadas. Ninguna pantalla recalcula kcal por su cuenta: cuatro sitios van a mostrar "cuánto llevo" y tienen que coincidir.
- **Banco de pruebas:** `app/supabase/tests/harness.ts` (`applyMigrations()`, `asUser(db, uid, sql)`, `createAuthUser(db)`). **Solo `asUser` aplica RLS**; fuera de ahí eres superusuario. Toda aserción de seguridad va por `asUser`.
- **Gate de cada tarea:** `cd app && npm run lint && npm test && npm run build`. Al empezar hay **159 tests** en verde.
- **Solo tokens de color**, ningún hex suelto. `--accent`/`--warn` son rellenos; texto sobre fondo claro o tintado usa `--accent-ink`/`--warn-ink`; texto sobre relleno de acento usa `--onaccent`.
- **Nada de librerías de componentes.** Primitivas en `app/src/ui/`.
- **Toda cadena de interfaz va a `app/src/i18n/es.ts` Y `en.ts`** en la misma tarea.
- **Comentarios en castellano**, explicando el porqué.
- **Commits:** uno por tarea, `feat(ámbito): …`, terminado en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Si algo no encaja con el plan, para y repórtalo. No improvises.**

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `app/src/domain/nutrition.ts` | *(nuevo, T1)* Mifflin-St Jeor, factores, cotas. Puro. |
| `app/src/domain/intake.ts` | *(nuevo, T2)* El día, la semana y la racha de un miembro. Puro. |
| `…/migrations/20260921090000_rezet_member_body.sql` | *(nuevo, T3)* Datos corporales, privados por cuenta. |
| `…/migrations/20260921090100_rezet_intake.sql` | *(nuevo, T4)* `intake_share` + `intake_extra` + su RLS. |
| `…/migrations/20260921090200_rezet_finish_cook_v2.sql` | *(nuevo, T5)* Raciones dentro de la transacción de cocinar. |
| `app/src/data/supabaseStore/useIntake.ts` | *(nuevo, T7)* Consultas y mutaciones de consumo. |
| `app/src/sheets/MemberTargetSheet.tsx` | *(nuevo, T9)* "Tu objetivo": el formulario y la estimación. |
| `app/src/sheets/IntakeAddSheet.tsx` | *(nuevo, T11)* "Añadir lo que comí": las cuatro pestañas. |
| `app/src/screens/Week.tsx` | *(nuevo, T13)* "Tu semana": barras y racha. |

## Orden y reparto de modelos

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14.

| Tareas | Modelo | Por qué |
|---|---|---|
| T1, T2 | **Sonnet** | Aritmética con casos límite; un error aquí sale en cuatro pantallas a la vez. |
| T3, T4, T5 | **Sonnet** | RLS, privacidad y una transacción que descuenta despensa. |
| T6, T8, T14 | **Haiku** | Tipos, siembra de demo y cierre, con el compilador de red. |
| T7, T9, T10, T11, T12, T13 | **Sonnet** | Datos e interfaz. |

---

### Task 1: `domain/nutrition.ts` — la fórmula, en un solo sitio

**Files:**
- Create: `app/src/domain/nutrition.ts`, `app/src/domain/__tests__/nutrition.test.ts`

**Interfaces:**
- Produces: `Sex`, `Activity`, `Goal`, `BodyInput`, `ACTIVITY_FACTOR`, `GOAL_FACTOR`, `KCAL_MIN`, `KCAL_MAX`, `ageFrom`, `bmr`, `estimateTarget`, `clampTarget`.

- [ ] **Step 1: Escribir los tests**

`app/src/domain/__tests__/nutrition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FACTOR,
  KCAL_MAX,
  KCAL_MIN,
  ageFrom,
  bmr,
  clampTarget,
  estimateTarget,
} from '../nutrition';

const HOY = new Date('2026-09-21T10:00:00Z');

describe('nutrition', () => {
  it('la edad sale del año de nacimiento', () => {
    expect(ageFrom(1991, HOY)).toBe(35);
    expect(ageFrom(2026, HOY)).toBe(0);
  });

  it('Mifflin-St Jeor: las dos constantes del sexo', () => {
    // 10·62 + 6,25·168 − 5·35 + 5 = 620 + 1050 − 175 + 5
    expect(bmr('male', 62, 168, 35)).toBeCloseTo(1500, 5);
    // …y −161 en vez de +5
    expect(bmr('female', 62, 168, 35)).toBeCloseTo(1334, 5);
  });

  it('el objetivo aplica actividad y ajuste, y redondea a 50', () => {
    const t = estimateTarget(
      { sex: 'female', birthYear: 1991, heightCm: 168, weightKg: 62, activity: 'light', goal: 'maintain' },
      HOY,
    );
    // 1334 × 1,375 = 1834,25 → 1850
    expect(t).toBe(1850);
    expect(ACTIVITY_FACTOR.light).toBe(1.375);
  });

  it('bajar quita un 15 % y subir añade un 10 %', () => {
    const base = { sex: 'male', birthYear: 1991, heightCm: 180, weightKg: 80, activity: 'sedentary' } as const;
    const mantener = estimateTarget({ ...base, goal: 'maintain' }, HOY)!;
    const bajar = estimateTarget({ ...base, goal: 'lose' }, HOY)!;
    const subir = estimateTarget({ ...base, goal: 'gain' }, HOY)!;
    expect(bajar).toBeLessThan(mantener);
    expect(subir).toBeGreaterThan(mantener);
    expect(bajar / mantener).toBeCloseTo(0.85, 1);
  });

  it('sin sexo declarado no hay estimación: se pide el número', () => {
    expect(
      estimateTarget(
        { sex: null, birthYear: 1991, heightCm: 168, weightKg: 62, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('con menos de 18 años tampoco: la fórmula está validada en adultos', () => {
    expect(
      estimateTarget(
        { sex: 'male', birthYear: 2012, heightCm: 150, weightKg: 42, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('falta cualquier medida y no hay estimación', () => {
    expect(
      estimateTarget(
        { sex: 'male', birthYear: 1991, heightCm: null, weightKg: 62, activity: 'light', goal: 'maintain' },
        HOY,
      ),
    ).toBeNull();
  });

  it('la estimación no se sale de un rango sensato', () => {
    const enorme = estimateTarget(
      { sex: 'male', birthYear: 1991, heightCm: 250, weightKg: 400, activity: 'very_active', goal: 'gain' },
      HOY,
    );
    expect(enorme).toBeLessThanOrEqual(4500);
    const minimo = estimateTarget(
      { sex: 'female', birthYear: 1950, heightCm: 140, weightKg: 35, activity: 'sedentary', goal: 'lose' },
      HOY,
    );
    expect(minimo).toBeGreaterThanOrEqual(1200);
  });

  it('el número escrito a mano se acota a lo que acepta la base de datos', () => {
    expect(clampTarget(99999)).toBe(KCAL_MAX);
    expect(clampTarget(3)).toBe(KCAL_MIN);
    expect(clampTarget(1837)).toBe(1850);
    expect(clampTarget(Number.NaN)).toBe(2100);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run src/domain/__tests__/nutrition.test.ts
```
Esperado: FAIL, `Failed to resolve import "../nutrition"`.

- [ ] **Step 3: Escribir el módulo**

`app/src/domain/nutrition.ts`:

```ts
/**
 * Objetivo de calorías por persona — Mifflin-St Jeor.
 *
 * Vive aquí y solo aquí. La RPC que guarda los datos corporales RECIBE el
 * número ya calculado en vez de recalcularlo: dos copias de una fórmula
 * divergen, y las reglas de negocio de este repo son puras y testeadas.
 *
 * No es una app médica: esto es una estimación, el usuario siempre puede
 * escribir su propio número, y donde la fórmula no está validada (menores,
 * sexo no declarado) no se ofrece en vez de inventar una media.
 */

export type Sex = 'female' | 'male';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_FACTOR: Record<Goal, number> = {
  lose: 0.85,
  maintain: 1,
  gain: 1.1,
};

/** Lo que acepta la columna `member.kcal_target` (su `check` en la BD). */
export const KCAL_MIN = 1000;
export const KCAL_MAX = 5000;
/** Cotas de la ESTIMACIÓN, más estrechas: fuera de aquí no la ofrecemos. */
const ESTIMATE_MIN = 1200;
const ESTIMATE_MAX = 4500;
/** Edad mínima para usar la fórmula: está validada en adultos. */
const ADULT_AGE = 18;
const FALLBACK = 2100;

export interface BodyInput {
  sex: Sex | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: Activity;
  goal: Goal;
}

/** Del año de nacimiento, no de la fecha completa: menos dato personal. */
export function ageFrom(birthYear: number, today: Date): number {
  return Math.max(0, today.getFullYear() - birthYear);
}

/** Metabolismo basal. Las dos constantes son lo único que cambia con el sexo. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function round50(n: number): number {
  return Math.round(n / 50) * 50;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * `null` cuando la fórmula no aplica: sin sexo declarado, con algún dato
 * ausente, o con menos de 18 años. La interfaz pide entonces el número
 * directamente, que es más honesto que un cálculo con aire de exactitud.
 */
export function estimateTarget(input: BodyInput, today: Date): number | null {
  const { sex, birthYear, heightCm, weightKg, activity, goal } = input;
  if (!sex || birthYear === null || heightCm === null || weightKg === null) return null;
  const age = ageFrom(birthYear, today);
  if (age < ADULT_AGE) return null;
  const daily = bmr(sex, weightKg, heightCm, age) * ACTIVITY_FACTOR[activity] * GOAL_FACTOR[goal];
  return clamp(round50(daily), ESTIMATE_MIN, ESTIMATE_MAX);
}

/** Para el número escrito a mano: lo que la base de datos va a aceptar. */
export function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return FALLBACK;
  return clamp(round50(n), KCAL_MIN, KCAL_MAX);
}
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run src/domain/__tests__/nutrition.test.ts
```
Esperado: PASS, los nueve.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/src/domain/nutrition.ts app/src/domain/__tests__/nutrition.test.ts
git commit -m "feat(domain): objetivo de calorías con Mifflin-St Jeor"
```

---

### Task 2: `domain/intake.ts` — el día, la semana y la racha

**Files:**
- Create: `app/src/domain/intake.ts`, `app/src/domain/__tests__/intake.test.ts`

**Interfaces:**
- Produces: `DEFAULT_SHARE`, `IntakeExtraLine`, `MealLine`, `DayIntake`, `DayTotal`, `intakeOfDay`, `weekTotals`, `streakOf`.

La regla, y el motivo de que esté aquí: `plan_entry.servings` **no entra** en el cálculo personal. Sigue sirviendo solo para despensa y compra. Lo que cuenta para una persona es su ración: 1 por defecto, o lo que diga su `intake_share`.

- [ ] **Step 1: Escribir los tests**

`app/src/domain/__tests__/intake.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHARE, intakeOfDay, streakOf, weekTotals } from '../intake';
import type { PlanEntry, Recipe } from '../../types';

const receta = (id: string, kcal: number): Recipe =>
  ({ id, kcalPerServing: kcal, name: { es: id, en: id } } as unknown as Recipe);

const entrada = (id: string, recipeId: string, servings: number, cooked: boolean): PlanEntry =>
  ({ id, date: '2026-09-21', slot: 'lunch', recipeId, servings, cooked } as PlanEntry);

const recipes = new Map<string, Recipe>([
  ['r1', receta('r1', 500)],
  ['r2', receta('r2', 300)],
]);

describe('intake', () => {
  it('una comida cocinada cuenta UNA ración, no las del plato', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 4, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(500);
    expect(DEFAULT_SHARE).toBe(1);
  });

  it('lo planificado sin cocinar no cuenta para nadie', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, false)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.planned).toBe(500);
  });

  it('la excepción manda sobre el valor por defecto', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 1.5]]),
      extras: [],
    });
    expect(d.done).toBe(750);
  });

  it('cero raciones significa "no lo comí"', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 0]]),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.meals[0].share).toBe(0);
  });

  it('los extras suman y son independientes del plan', () => {
    const d = intakeOfDay({
      entries: [],
      recipeById: recipes,
      shares: new Map(),
      extras: [{ id: 'e1', label: 'Café', kcal: 90 }, { id: 'e2', label: 'Cerveza', kcal: 150 }],
    });
    expect(d.extras).toBe(240);
    expect(d.done).toBe(240);
  });

  it('una receta que ya no existe no rompe el día', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'fantasma', 2, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
  });

  it('la semana devuelve un total por día, incluidos los vacíos', () => {
    const totals = weekTotals({
      dates: ['2026-09-21', '2026-09-22'],
      entriesByDate: new Map([['2026-09-21', [entrada('p1', 'r2', 1, true)]]]),
      recipeById: recipes,
      shares: new Map(),
      extrasByDate: new Map(),
    });
    expect(totals).toEqual([
      { date: '2026-09-21', kcal: 300 },
      { date: '2026-09-22', kcal: 0 },
    ]);
  });

  it('la racha solo cuenta días pasados y completos', () => {
    const dias: { date: string; kcal: number }[] = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 1850 },
      { date: '2026-09-20', kcal: 2000 },
      { date: '2026-09-21', kcal: 200 }, // hoy, a medias: no debe cortar la racha
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(3);
  });

  it('un día fuera de la banda corta la racha', () => {
    const dias = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 3000 },
      { date: '2026-09-20', kcal: 1900 },
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(1);
  });

  it('sin objetivo no hay racha que calcular', () => {
    expect(streakOf([{ date: '2026-09-20', kcal: 1900 }], 0, '2026-09-21')).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run src/domain/__tests__/intake.test.ts
```
Esperado: FAIL, `Failed to resolve import "../intake"`.

- [ ] **Step 3: Escribir el módulo**

`app/src/domain/intake.ts`:

```ts
import type { MealSlot, PlanEntry, Recipe } from '../types';

/**
 * Lo que ha comido una persona en un día.
 *
 * La regla, en una línea: las comidas del plan COCINADAS cuentan una ración
 * por persona, ajustable, más los extras que haya registrado.
 *
 * `plan_entry.servings` NO entra aquí: son las raciones del plato, y sirven
 * para descontar de la despensa y para la compra, no para saber cuánto ha
 * comido alguien. Contar 4 raciones a una persona porque se cocinaron 4 es
 * el fallo que este módulo existe para arreglar.
 *
 * El valor por defecto es implícito: cocinar suma a todos sin escribir nada.
 * Solo la excepción ("comí media", "no lo comí") ocupa una fila.
 */

export const DEFAULT_SHARE = 1;
/** Margen para dar un día por "dentro del objetivo". */
const STREAK_BAND = 0.1;

export interface IntakeExtraLine {
  id: string;
  label: string;
  kcal: number;
}

export interface MealLine {
  planEntryId: string;
  recipeId: string;
  slot: MealSlot;
  cooked: boolean;
  /** Raciones de ESTA persona. 0 = no lo comió. */
  share: number;
  /** Lo que aporta a su día: 0 si aún no se ha cocinado. */
  kcal: number;
}

export interface DayIntake {
  /** Lo que lleva comido. */
  done: number;
  /** Lo que llevaría si se cocinara todo lo planificado de hoy. */
  planned: number;
  /** Solo los extras, para poder enseñarlos aparte. */
  extras: number;
  meals: MealLine[];
}

export interface DayTotal {
  date: string;
  kcal: number;
}

function kcalOf(recipeById: Map<string, Recipe>, recipeId: string): number {
  return recipeById.get(recipeId)?.kcalPerServing ?? 0;
}

export function shareFor(shares: Map<string, number>, planEntryId: string): number {
  const v = shares.get(planEntryId);
  return v === undefined ? DEFAULT_SHARE : v;
}

export function intakeOfDay(input: {
  entries: PlanEntry[];
  recipeById: Map<string, Recipe>;
  shares: Map<string, number>;
  extras: IntakeExtraLine[];
}): DayIntake {
  const { entries, recipeById, shares, extras } = input;

  const meals: MealLine[] = entries.map((e) => {
    const share = shareFor(shares, e.id);
    const porRacion = kcalOf(recipeById, e.recipeId);
    return {
      planEntryId: e.id,
      recipeId: e.recipeId,
      slot: e.slot,
      cooked: e.cooked,
      share,
      kcal: e.cooked ? porRacion * share : 0,
    };
  });

  const extrasKcal = extras.reduce((sum, x) => sum + x.kcal, 0);
  const done = meals.reduce((sum, m) => sum + m.kcal, 0) + extrasKcal;
  const planned =
    meals.reduce((sum, m) => sum + kcalOf(recipeById, m.recipeId) * m.share, 0) + extrasKcal;

  return { done, planned, extras: extrasKcal, meals };
}

export function weekTotals(input: {
  dates: string[];
  entriesByDate: Map<string, PlanEntry[]>;
  recipeById: Map<string, Recipe>;
  shares: Map<string, number>;
  extrasByDate: Map<string, IntakeExtraLine[]>;
}): DayTotal[] {
  const { dates, entriesByDate, recipeById, shares, extrasByDate } = input;
  return dates.map((date) => ({
    date,
    kcal: intakeOfDay({
      entries: entriesByDate.get(date) ?? [],
      recipeById,
      shares,
      extras: extrasByDate.get(date) ?? [],
    }).done,
  }));
}

/**
 * Días seguidos dentro del objetivo, contando hacia atrás.
 *
 * El día en curso NO entra: darlo por bueno a las nueve de la mañana, cuando
 * aún no has comido nada, sería mentir. Tampoco lo corta.
 */
export function streakOf(days: DayTotal[], target: number, todayKey: string): number {
  if (target <= 0) return 0;
  const pasados = days
    .filter((d) => d.date < todayKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  let n = 0;
  for (const d of pasados) {
    if (Math.abs(d.kcal - target) <= target * STREAK_BAND) n += 1;
    else break;
  }
  return n;
}
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run src/domain/__tests__/intake.test.ts
```
Esperado: PASS, los diez.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/src/domain/intake.ts app/src/domain/__tests__/intake.test.ts
git commit -m "feat(domain): el día, la semana y la racha de un miembro"
```

---

### Task 3: `member_body` — los datos corporales, privados de verdad

**Files:**
- Create: `app/supabase/migrations/20260921090000_rezet_member_body.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Consumes: `private.can_act_for(uuid)`, tabla `member`.
- Produces: tabla `public.member_body`; `public.set_member_body(p_member_id uuid, p_patch jsonb, p_kcal_target int)`.

Esta tabla es la razón de ser del nivel de privacidad "propio" de la spec §3.2: el peso de alguien no lo ve su pareja. **No puede vivir en `profile`**, cuya política de SELECT es de hogar.

- [ ] **Step 1: Escribir los tests**

Añade al final del `describe` de `app/supabase/tests/migrations.test.ts`:

```ts
  it('member_body: nadie lee los datos corporales de otro adulto del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );
    await asUser(
      db,
      bea,
      `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":62,"sex":"female"}'::jsonb, 1850)`,
    );

    // Bea sí ve lo suyo.
    const propio = (await asUser(db, bea, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(propio.rows[0].n).toBe(1);

    // Ana, del mismo hogar, no ve nada.
    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);

    // Y tampoco puede escribirlo.
    await expect(
      asUser(db, ana, `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":99}'::jsonb, null)`),
    ).rejects.toThrow();

    await db.close();
  }, 120_000);

  it('member_body: el tutelado sí lo gestiona quien tiene cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `select public.set_member_body('${nico.rows[0].id}', '{"birth_year":2014}'::jsonb, 1600)`,
    );

    const visto = (await asUser(db, ana, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(visto.rows[0].n).toBe(1);

    const objetivo = await db.query<{ kcal_target: number }>(
      `select kcal_target from public.member where id = '${nico.rows[0].id}'`,
    );
    expect(objetivo.rows[0].kcal_target).toBe(1600);
    await db.close();
  }, 120_000);

  it('member_body: salir del hogar borra los datos corporales', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );
    await asUser(db, bea, `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":62}'::jsonb, 1850)`);

    await asUser(db, bea, 'select public.leave_household()');

    const quedan = await db.query<{ n: number }>('select count(*)::int as n from public.member_body');
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('member_body: no se puede escribir la tabla por la vía directa', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await expect(
      asUser(db, ana, `insert into public.member_body (member_id, weight_kg) values ('${yo.rows[0].id}', 62)`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `relation "public.member_body" does not exist`.

- [ ] **Step 3: Escribir la migración**

`app/supabase/migrations/20260921090000_rezet_member_body.sql`:

```sql
-- Diseño §3.2 y §6.1 — datos corporales, nivel de privacidad "propio".
--
-- Por qué una tabla aparte y no columnas en `profile`: la política de SELECT
-- de `profile` es de HOGAR (20260905131217:332), así que una columna
-- `weight_kg` ahí sería legible por tu pareja el día que se añadiera. En
-- Postgres no hay seguridad por columna para SELECT: la única separación
-- real es otra tabla con su propia política.

create table public.member_body (
  member_id   uuid primary key references public.member(id) on delete cascade,
  sex         text check (sex in ('female','male')),   -- null = no declarado
  birth_year  int  check (birth_year between 1900 and 2100),
  height_cm   numeric(5,1) check (height_cm between 50 and 250),
  weight_kg   numeric(5,1) check (weight_kg between 15 and 400),
  activity    text not null default 'sedentary'
              check (activity in ('sedentary','light','moderate','active','very_active')),
  goal        text not null default 'maintain' check (goal in ('lose','maintain','gain')),
  updated_at  timestamptz not null default now()
);

alter table public.member_body enable row level security;

-- `can_act_for` ya comprueba las tres condiciones que hacen falta: mismo
-- hogar, fila propia o tutelado explícito, y no borrado. No se reimplementan
-- aquí: un solo predicado para todas las tablas personales.
create policy member_body_rw on public.member_body for all
  to authenticated
  using ((select private.can_act_for(member_body.member_id)))
  with check ((select private.can_act_for(member_body.member_id)));

-- Sin escritura directa: solo por RPC, que además mantiene `kcal_target`.
revoke all on public.member_body from anon, authenticated;
grant select on public.member_body to authenticated;

-- El objetivo llega YA CALCULADO. La fórmula (Mifflin-St Jeor) vive en
-- `app/src/domain/nutrition.ts` y solo ahí: implementarla también en
-- PL/pgSQL sería una segunda copia de una regla de negocio, y dos copias
-- divergen. La base de datos sigue validando el rango con el `check` de
-- `member.kcal_target`.
create or replace function public.set_member_body(
  p_member_id uuid,
  p_patch jsonb,
  p_kcal_target int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_act_for(p_member_id)) then
    raise exception 'REZET_FORBIDDEN: no puedes editar esos datos';
  end if;

  insert into public.member_body (member_id) values (p_member_id)
  on conflict (member_id) do nothing;

  -- Asignaciones literales, nunca SQL dinámico sobre las claves del patch:
  -- una clave `member_id` colada en un `execute format()` escribiría en la
  -- fila de otra persona.
  update public.member_body set
    sex        = case when p_patch ? 'sex' then p_patch->>'sex' else sex end,
    birth_year = case when p_patch ? 'birth_year' then (p_patch->>'birth_year')::int else birth_year end,
    height_cm  = case when p_patch ? 'height_cm' then (p_patch->>'height_cm')::numeric else height_cm end,
    weight_kg  = case when p_patch ? 'weight_kg' then (p_patch->>'weight_kg')::numeric else weight_kg end,
    activity   = coalesce(nullif(p_patch->>'activity', ''), activity),
    goal       = coalesce(nullif(p_patch->>'goal', ''), goal),
    updated_at = now()
  where member_id = p_member_id;

  if p_kcal_target is not null then
    update public.member set kcal_target = p_kcal_target where id = p_member_id;
  end if;
end;
$$;

revoke all on function public.set_member_body(uuid, jsonb, int) from public, anon;
grant execute on function public.set_member_body(uuid, jsonb, int) to authenticated;

-- Diseño §3.2, cinturón además de tirantes: los datos corporales NO
-- sobreviven a la salida del hogar en ninguna forma. La fila de `member` se
-- conserva (borrado lógico, para la atribución del historial); esto no.
create or replace function private.drop_member_body_on_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.member_body
   where member_id in (select id from public.member where auth_user_id = old.id);
  return old;
end;
$$;

drop trigger if exists profile_delete_drop_body_trg on public.profile;
create trigger profile_delete_drop_body_trg
before delete on public.profile
for each row execute function private.drop_member_body_on_profile_delete();
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS, los cuatro nuevos.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/supabase/migrations/20260921090000_rezet_member_body.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): datos corporales privados por cuenta"
```

---

### Task 4: `intake_share` e `intake_extra` — el diario, que no lee la casa

**Files:**
- Create: `app/supabase/migrations/20260921090100_rezet_intake.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Consumes: `private.can_act_for(uuid)`, `member`, `plan_entry`, `recipe`.
- Produces: tablas `public.intake_share` y `public.intake_extra`.

**La decisión que importa:** la RLS de estas dos tablas va **por miembro**, no por hogar. El diario de comidas de quien tiene cuenta es suyo. `household_id` está desnormalizado en `intake_extra` para la cascada y para anclar la integridad, **nunca** como predicado de lectura.

- [ ] **Step 1: Escribir los tests**

```ts
  it('intake: el diario de uno no lo lee el resto del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await asUser(
      db,
      bea,
      `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
       values ('${h.rows[0].id}', '${beaMember.rows[0].id}', '2026-09-21', 'Cerveza', 150, 'manual')`,
    );

    const suyo = (await asUser(db, bea, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(suyo.rows[0].n).toBe(1);

    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('intake: no se puede registrar en nombre de otro adulto', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await expect(
      asUser(
        db,
        ana,
        `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
         values ('${h.rows[0].id}', '${beaMember.rows[0].id}', '2026-09-21', 'Colado', 500, 'manual')`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('intake: un tutelado sí lo registra quien lo gestiona', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
       values ('${h.rows[0].id}', '${nico.rows[0].id}', '2026-09-21', 'Merienda', 200, 'manual')`,
    );
    const n = (await asUser(db, ana, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(n.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  it('intake: no se puede colar un extra en el hogar equivocado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");
    const hAna = await db.query<{ id: string }>(
      `select household_id as id from public.profile where id = '${ana}'`,
    );
    const mMallory = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
         values ('${hAna.rows[0].id}', '${mMallory.rows[0].id}', '2026-09-21', 'Cruzado', 100, 'manual')`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('intake_share: borrar la comida del plan se lleva la excepción', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name) values
        ('00000000-0000-4000-8000-000000000001', '${h.rows[0].id}', 'Lentejas');
      insert into public.plan_entry (id, household_id, on_date, slot, recipe_id, servings) values
        ('00000000-0000-4000-8000-000000000002', '${h.rows[0].id}', '2026-09-21', 'lunch',
         '00000000-0000-4000-8000-000000000001', 2);
    `);

    await asUser(
      db,
      ana,
      `insert into public.intake_share (member_id, plan_entry_id, servings)
       values ('${yo.rows[0].id}', '00000000-0000-4000-8000-000000000002', 0.5)`,
    );

    await db.exec("delete from public.plan_entry where id = '00000000-0000-4000-8000-000000000002'");
    const quedan = await db.query<{ n: number }>('select count(*)::int as n from public.intake_share');
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `relation "public.intake_extra" does not exist`.

- [ ] **Step 3: Escribir la migración**

`app/supabase/migrations/20260921090100_rezet_intake.sql`:

```sql
-- Diseño §6.2 — el registro personal de consumo.
--
-- Dos tablas y una ausencia:
--   intake_share  la EXCEPCIÓN al "una ración por persona". El valor por
--                 defecto es implícito: cocinar suma a todos sin escribir
--                 ninguna fila, así que solo lo raro ocupa espacio.
--   intake_extra  lo que se come fuera del plan.
--   (no hay tabla de favoritos: los favoritos son una CONSULTA sobre
--    intake_extra, agrupando lo que más se repite. Una tabla menos, un
--    contador de uso menos, una cuota menos, y la misma experiencia.)

create table public.intake_share (
  member_id     uuid not null references public.member(id) on delete cascade,
  plan_entry_id uuid not null references public.plan_entry(id) on delete cascade,
  servings      numeric(4,2) not null check (servings between 0 and 6),
  updated_at    timestamptz not null default now(),
  primary key (member_id, plan_entry_id)
);

create table public.intake_extra (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  member_id     uuid not null references public.member(id) on delete cascade,
  date          date not null,
  label         text not null,
  kcal          int  not null check (kcal between 0 and 10000),
  source        text not null check (source in ('manual','recipe','barcode')),
  recipe_id     uuid references public.recipe(id) on delete set null,
  -- Distingue "lo registré yo" de "me lo registró mi padre": hace falta para
  -- el nivel tutelado y para que el historial se pueda leer.
  created_by    uuid references public.member(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index intake_extra_member_date_idx on public.intake_extra (member_id, date);
create index intake_extra_household_idx on public.intake_extra (household_id);

alter table public.intake_share enable row level security;
alter table public.intake_extra enable row level security;

-- RLS POR MIEMBRO, no por hogar: el diario de comidas de quien tiene cuenta
-- es suyo. `household_id` en intake_extra existe para la cascada y para
-- anclar la integridad (el trigger de abajo), NUNCA como predicado de
-- lectura: con `household_id = current_household()` toda la casa leería lo
-- que come cada uno.
create policy intake_share_rw on public.intake_share for all
  to authenticated
  using ((select private.can_act_for(intake_share.member_id)))
  with check ((select private.can_act_for(intake_share.member_id)));

create policy intake_extra_rw on public.intake_extra for all
  to authenticated
  using ((select private.can_act_for(intake_extra.member_id)))
  with check ((select private.can_act_for(intake_extra.member_id)));

revoke all on public.intake_share from anon, authenticated;
grant select, insert, update, delete on public.intake_share to authenticated;
revoke all on public.intake_extra from anon, authenticated;
grant select, insert, update, delete on public.intake_extra to authenticated;

-- Mismo enfoque que 20260919100400: una fila no puede apuntar a un miembro o
-- una receta de otro hogar. La RLS acota quién escribe; esto acota QUÉ.
create or replace function private.check_intake_extra_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.member m
     where m.id = new.member_id and m.household_id = new.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: ese miembro no es de ese hogar';
  end if;

  if new.recipe_id is not null and not exists (
    select 1 from public.recipe r
     where r.id = new.recipe_id and r.household_id = new.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: esa receta no es de ese hogar';
  end if;

  return new;
end;
$$;

drop trigger if exists intake_extra_refs_trg on public.intake_extra;
create trigger intake_extra_refs_trg
before insert or update on public.intake_extra
for each row execute function private.check_intake_extra_refs();
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS, los cinco nuevos.

Si el test de la cascada falla porque `recipe` o `plan_entry` piden columnas que no he puesto en el `insert`, mira su definición en `20260905131217_rezet_core_schema.sql` y **añade solo las columnas que falten**, sin cambiar la aserción.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/supabase/migrations/20260921090100_rezet_intake.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): registro personal de consumo con RLS por miembro"
```

---

### Task 5: `finish_cook_v2` — las raciones dentro de la misma transacción

**Files:**
- Create: `app/supabase/migrations/20260921090200_rezet_finish_cook_v2.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Produces: `public.finish_cook_v2(p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot, p_shares jsonb)` → `{"shortages": [...], "plan_entry_id": "…"}`; `public.finish_cook(…)` sigue existiendo con su firma y devolviendo solo el array.

**Por qué existe esta tarea.** `finish_cook` devuelve el array de `shortages` y nada más, y cuando `p_plan_entry_id is null` inserta él mismo la entrada de plan sin devolver su `id`. El camino "cocinar algo no planificado" se queda sin el id con el que escribir las raciones. Y cambiar su tipo de retorno rompería a las PWA cacheadas, que lo parsean como array.

Escribir las raciones **fuera** de la transacción no vale: si falla la segunda llamada, un "no lo cené" se pierde en silencio.

- [ ] **Step 1: Escribir los tests**

```ts
  it('finish_cook_v2 devuelve el id de la comida que crea y escribe las raciones', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000011', '${h.rows[0].id}', 'Lentejas', 500);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook_v2(
         '00000000-0000-4000-8000-000000000011', 2, null, '2026-09-21', 'lunch',
         '[{"member_id":"${yo.rows[0].id}","servings":1},
           {"member_id":"${nico.rows[0].id}","servings":0}]'::jsonb
       ) as out`,
    )) as { rows: { out: { shortages: unknown[]; plan_entry_id: string } }[] };

    expect(res.rows[0].out.plan_entry_id).toBeTruthy();
    expect(Array.isArray(res.rows[0].out.shortages)).toBe(true);

    const shares = await db.query<{ n: number; ceros: number }>(
      `select count(*)::int as n, count(*) filter (where servings = 0)::int as ceros
         from public.intake_share`,
    );
    expect(shares.rows[0].n).toBe(2);
    expect(shares.rows[0].ceros).toBe(1);
    await db.close();
  }, 120_000);

  it('finish_cook sigue devolviendo solo el array, para los clientes viejos', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000012', '${h.rows[0].id}', 'Sopa', 200);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook('00000000-0000-4000-8000-000000000012', 1, null, '2026-09-21', 'dinner') as out`,
    )) as { rows: { out: unknown }[] };

    expect(Array.isArray(res.rows[0].out)).toBe(true);
    await db.close();
  }, 120_000);

  it('finish_cook_v2 no acepta raciones de un miembro de otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");
    const h = await db.query<{ id: string }>(
      `select household_id as id from public.profile where id = '${ana}'`,
    );
    const mMallory = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000013', '${h.rows[0].id}', 'Arroz', 400);
    `);

    await expect(
      asUser(
        db,
        ana,
        `select public.finish_cook_v2(
           '00000000-0000-4000-8000-000000000013', 1, null, '2026-09-21', 'lunch',
           '[{"member_id":"${mMallory.rows[0].id}","servings":1}]'::jsonb)`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `function public.finish_cook_v2(...) does not exist`.

- [ ] **Step 3: Escribir la migración**

**Copia el cuerpo actual de `finish_cook` desde `20260918100200_rezet_harden_transactional_rpcs.sql` (líneas 155-260)** — es la versión vigente, con el bloqueo de fila que añadió el endurecimiento — y cámbialo **solo** en lo que sigue:

1. Renombra la función a `finish_cook_v2` y añade el sexto parámetro `p_shares jsonb default '[]'::jsonb`.
2. Declara `v_plan_entry_id uuid;` entre las variables.
3. En la rama `if p_plan_entry_id is not null`, añade `v_plan_entry_id := p_plan_entry_id;` después del `update`.
4. En la rama `else`, añade `returning id into v_plan_entry_id` al `insert into public.plan_entry`.
5. Antes del `return`, escribe las raciones:

```sql
  -- Las raciones van DENTRO de esta transacción, no en una llamada aparte:
  -- si fallara la segunda, un "no lo cené" se perdería en silencio y el día
  -- de esa persona quedaría inflado sin que nadie se enterase.
  if jsonb_typeof(p_shares) = 'array' then
    insert into public.intake_share (member_id, plan_entry_id, servings)
    select (s->>'member_id')::uuid, v_plan_entry_id, (s->>'servings')::numeric
      from jsonb_array_elements(p_shares) as s
     where exists (
       select 1 from public.member m
        where m.id = (s->>'member_id')::uuid
          and m.household_id = v_household_id
          and m.deleted_at is null
     )
    on conflict (member_id, plan_entry_id) do update set
      servings = excluded.servings, updated_at = now();

    -- Un id que no es de este hogar no se ignora en silencio: se rechaza.
    if (select count(*) from jsonb_array_elements(p_shares)) <>
       (select count(*) from public.intake_share where plan_entry_id = v_plan_entry_id) then
      raise exception 'REZET_FOREIGN_HOUSEHOLD: alguna ración no es de este hogar';
    end if;
  end if;
```

6. Cambia el retorno a:

```sql
  return jsonb_build_object('shortages', v_shortages, 'plan_entry_id', v_plan_entry_id);
```

7. Y deja `finish_cook` como envoltorio, con su firma intacta:

```sql
-- Envoltorio para las PWA cacheadas, que parsean el retorno como array. No
-- se puede cambiar el tipo de retorno de una función que ya está publicada
-- sin romperlas.
create or replace function public.finish_cook(
  p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.finish_cook_v2(p_recipe_id, p_servings, p_plan_entry_id, p_today, p_slot, '[]'::jsonb) -> 'shortages'
$$;

revoke all on function public.finish_cook_v2(uuid, integer, uuid, date, meal_slot, jsonb) from public, anon;
grant execute on function public.finish_cook_v2(uuid, integer, uuid, date, meal_slot, jsonb) to authenticated;
revoke all on function public.finish_cook(uuid, integer, uuid, date, meal_slot) from public, anon;
grant execute on function public.finish_cook(uuid, integer, uuid, date, meal_slot) to authenticated;
```

**Comprueba antes de escribir** que `20260918100200` es de verdad la definición más reciente de `finish_cook`: `grep -rln "function public.finish_cook" app/supabase/migrations/ | sort | tail -1`. Si no lo es, manda la más reciente y **dilo en tu informe**.

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS, incluidos los tests de `finish_cook` que ya existían — si alguno de esos se rompe, has cambiado el comportamiento del envoltorio y hay que arreglarlo, no ajustar el test.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/supabase/migrations/20260921090200_rezet_finish_cook_v2.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): finish_cook_v2 escribe las raciones en la misma transacción"
```

---

### Task 6: Tipos y contrato `Store`

**Files:**
- Modify: `app/src/types.ts`, `app/src/data/storeContext.ts`

**Interfaces:**
- Produces: `MemberBody`, `IntakeExtra`, `ExtraInput`, `FrequentExtra`; y en `Store`: `myBody`, `setMyBody`, `intakeOfDayFor`, `setShare`, `addExtra`, `removeExtra`, `frequentExtras`, `weekTotalsFor`.

- [ ] **Step 1: Añadir los tipos**

Al final de `app/src/types.ts`:

```ts
/** Datos corporales de un miembro. Privados: solo suyos, o de quien le tutela. */
export interface MemberBody {
  sex: 'female' | 'male' | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
}

/** Algo que alguien comió fuera del plan. */
export interface IntakeExtra {
  id: string;
  memberId: MemberId;
  /** Fecha ISO local, `YYYY-MM-DD`. */
  date: string;
  label: string;
  kcal: number;
  source: 'manual' | 'recipe' | 'barcode';
  recipeId: string | null;
}

export interface ExtraInput {
  memberId: MemberId;
  date: string;
  label: string;
  kcal: number;
  source: 'manual' | 'recipe' | 'barcode';
  recipeId?: string | null;
}

/** Un extra que alguien repite. Derivado de `intake_extra`, no es una tabla. */
export interface FrequentExtra {
  label: string;
  kcal: number;
  times: number;
}
```

- [ ] **Step 2: Ampliar el contrato**

En `app/src/data/storeContext.ts`, dentro de `interface Store`:

```ts
  /** Datos corporales del miembro propio. `null` si no hay o no hay acceso. */
  myBody: MemberBody | null;
  /**
   * Contrato: `rpc/set_member_body`. El objetivo va YA CALCULADO con
   * `domain/nutrition.ts`: la fórmula vive ahí y solo ahí.
   */
  setMyBody: (memberId: MemberId, patch: Partial<MemberBody>, kcalTarget: number | null) => Promise<void>;

  /** Puro, sobre datos ya descargados. Ver `domain/intake.ts`. */
  intakeOfDayFor: (memberId: MemberId, date: string) => DayIntake;
  /** Raciones de un miembro en una comida del plan. 0 = no la comió. */
  setShare: (memberId: MemberId, planEntryId: string, servings: number) => Promise<void>;
  addExtra: (input: ExtraInput) => Promise<string>;
  removeExtra: (id: string) => Promise<void>;
  /** Los que más repite, derivados de su historial. No hay tabla de favoritos. */
  frequentExtras: (memberId: MemberId) => FrequentExtra[];
  /** Totales por día para la pantalla de progreso. */
  weekTotalsFor: (memberId: MemberId, dates: string[]) => DayTotal[];
```

Importa `DayIntake` y `DayTotal` de `../domain/intake`, y los tipos nuevos de `../types`.

- [ ] **Step 3: Ver el fallo de compilación**

```bash
cd app && npm run lint
```
Esperado: FAIL — los dos proveedores ya no cumplen el contrato. Es deliberado: los errores son la lista de lo que falta, y lo cierran T7 y T8. Apunta esa lista en tu informe.

- [ ] **Step 4: Commit**

```bash
git add app/src/types.ts app/src/data/storeContext.ts
git commit -m "feat(types): contrato de nutrición personal en el Store"
```

---

### Task 7: `useIntake` — la capa real

**Files:**
- Create: `app/src/data/supabaseStore/useIntake.ts`
- Modify: `app/src/data/supabaseStore.tsx`, `app/src/data/supabaseStore/keys.ts`

**Interfaces:**
- Consumes: tipos de T6, tablas de T3/T4, `storeKeys`.
- Produces: `useIntake(householdId, myMemberId, recipeById, plan)` con los ocho miembros del contrato.

- [ ] **Step 1: Claves nuevas**

En `keys.ts`, añade al objeto `storeKeys`:

```ts
  body: (householdId: string) => ['memberBody', householdId] as const,
  intakeShares: (householdId: string) => ['intakeShares', householdId] as const,
  intakeExtras: (householdId: string) => ['intakeExtras', householdId] as const,
```

- [ ] **Step 2: Escribir el hook**

`app/src/data/supabaseStore/useIntake.ts`. Puntos que tiene que cumplir, y por qué:

- **Rango de fechas:** pide `intake_extra` de la semana actual ± 1, el mismo rango que ya usa el plan. Calcula los límites con `addDays`/`dateKey` de `../../domain/dates`; no inventes otro criterio ni descargues el historial entero.
- **`intakeOfDayFor`** no calcula nada por su cuenta: filtra las entradas del plan de ese día con `entriesOfDay` (`../../domain/shopping`), construye el `Map` de shares y la lista de extras del miembro, y llama a `intakeOfDay` de `../../domain/intake`.
- **`frequentExtras`** agrupa los `intake_extra` con `source === 'manual'` del miembro por `label` + `kcal`, ordena por número de repeticiones y devuelve como mucho 8.
- **Cada mutación invalida su clave.** Una invalidación que falte no da error: la pantalla se queda con datos viejos y nadie se entera.
- **`addExtra` manda `household_id`** (lo tienes en el hook) y `created_by` con el miembro propio, para distinguir "lo registré yo" de "me lo registró otro".
- **`setShare` hace upsert** sobre la clave `(member_id, plan_entry_id)`.
- **`setMyBody`** llama a `supabase.rpc('set_member_body', { p_member_id, p_patch, p_kcal_target })`, mandando en `p_patch` solo las claves presentes (las ausentes las conserva el servidor; mandar `undefined` como null borraría datos que nadie pidió borrar).
- Usa `MemberId`, nunca `string`, para los ids de miembro.

- [ ] **Step 3: Cablearlo**

En `supabaseStore.tsx`, llama al hook junto a `useMembers` y añade los ocho al objeto `value`, con sus dependencias.

- [ ] **Step 4: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```
Esperado: `lint` falla **solo** por `store.tsx` (demo), que es T8. Si falla por `supabaseStore.tsx`, no has terminado.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/supabaseStore/useIntake.ts app/src/data/supabaseStore/keys.ts app/src/data/supabaseStore.tsx
git commit -m "feat(data): consumo personal en la capa real"
```

---

### Task 8: El modo demo

**Files:**
- Modify: `app/src/data/store.tsx`, `app/src/data/seed.ts`

- [ ] **Step 1: Sembrar**

En `seed.ts`, añade y exporta datos que hagan que la demo enseñe la funcionalidad desde el primer segundo: un `MEMBER_BODY` para Ana (`sex: 'female'`, `birthYear: 1991`, `heightCm: 168`, `weightKg: 62`, `activity: 'light'`, `goal: 'maintain'`) y dos o tres `INTAKE_EXTRAS` de hoy (usa `todayKey()` de `../domain/dates`), del estilo "Café con leche 90" y "Cerveza 150".

- [ ] **Step 2: Implementar el contrato en la demo**

En `store.tsx`, implementa los ocho **de verdad** sobre el estado persistido (`usePersistentState`, el mismo que el resto del estado demo — no estado en memoria que se pierda al recargar). Las funciones de lectura (`intakeOfDayFor`, `frequentExtras`, `weekTotalsFor`) llaman a `domain/intake.ts`, igual que la capa real: si divergen, la demo enseña algo que la app no hace.

- [ ] **Step 3: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
```
Esperado: los tres en verde. Aquí se cierra el contrato roto de T6.

```bash
git add app/src/data/store.tsx app/src/data/seed.ts
git commit -m "feat(data): consumo personal en el modo demo"
```

---

### Task 9: Hoja "Tu objetivo"

**Files:**
- Create: `app/src/sheets/MemberTargetSheet.tsx`
- Modify: `app/src/sheets/MemberSheet.tsx`, `app/src/App.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Diseño aprobado. De arriba abajo: cabecera con volver y título "Tu objetivo"; **aviso de privacidad el primero de todo**, en una tarjeta `--soft` con icono de candado, diciendo que solo tú ves esos datos; tarjeta con el formulario (segmentado Mujer / Hombre / Prefiero no decirlo; tres campos en fila: año, altura, peso; `select` de actividad con las cinco opciones y su explicación; segmentado Bajar / Mantener / Subir); tarjeta `--soft` con la estimación en grande (`text.bigNumber`) y una frase diciendo que es una estimación, no una receta médica; y abajo el objetivo **editable** con −/+ de 50 y la nota del rango. Botón Guardar de 54 px.

Reglas que no son de estilo:

- **La estimación sale de `estimateTarget`.** Cuando devuelve `null` —sin sexo declarado, con algún dato en blanco, o con menos de 18 años— la tarjeta de estimación **no se muestra**; en su lugar, una línea explicando que ahí hay que poner el número a mano. No inventes una media.
- Guardar llama a `setMyBody(memberId, patch, clampTarget(objetivo))`.
- El campo de objetivo se acota con `clampTarget`, así que nunca puede mandar algo que el `check` de la base rechace.
- Se entra desde `MemberSheet`: una fila "Objetivo diario" que abre esta hoja, visible solo si `canEdit` (eres tú o es un tutelado).

Claves de i18n nuevas, en los dos idiomas: `targetSheetTitle`, `targetPrivacy`, `targetSex`, `targetSexFemale`, `targetSexMale`, `targetSexUndisclosed`, `targetBirthYear`, `targetHeight`, `targetWeight`, `targetActivity`, y las cinco de actividad, `targetGoal`, `targetGoalLose/Maintain/Gain`, `targetEstimate`, `targetEstimateNote`, `targetManualOnly`, `targetYourTarget`, `targetRange`.

- [ ] **Step 1: Escribir la hoja, los textos y el enganche**
- [ ] **Step 2: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): hoja del objetivo de calorías con estimación"
```

---

### Task 10: "Tu día" en Hoy, y el anillo desde el registro

**Files:**
- Modify: `app/src/screens/Today.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Diseño aprobado. El anillo se queda donde está pero cambia de fuente; debajo, la sección "Tu día".

- `done` y `planned` dejan de calcularse en la pantalla y salen de `intakeOfDayFor(myMemberId, today)`. **Borra la aritmética que hay hoy en el `useMemo`**: si se queda, hay dos fuentes de verdad.
- Cada comida del plan del día es una tarjeta: nombre de la receta, la franja y si está cocinada, sus kcal a la derecha, y —solo si está cocinada— el segmentado ½ / 1 / 1½ / 2 (altura 32, radio 11, `min-width` 44 para que se pueda tocar) más un botón "No lo comí". Tocar cualquiera llama a `setShare`.
- Lo planificado sin cocinar se ve apagado (`--muted`) y con su aportación prefijada de "+", porque todavía no cuenta.
- Los extras van en una tarjeta debajo, con su nombre y sus kcal.
- Botón "Añadir algo que comí" a 52 px que abre la hoja de T11.
- Cuando te pasas del objetivo, el aviso usa `--warn`/`--warn-ink`. **Nunca `--accent` para un aviso.**

Claves nuevas: `yourDay`, `yourDayCount`, `notEaten`, `addWhatIAte`, `mealNotCooked`, `overTarget`.

- [ ] **Step 1: Cambiar la pantalla y los textos**
- [ ] **Step 2: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(today): el anillo cuenta lo que has comido tú"
```

---

### Task 11: Hoja "Añadir lo que comí"

**Files:**
- Create: `app/src/sheets/IntakeAddSheet.tsx`
- Modify: `app/src/App.tsx`, `app/src/sheets/PantryScanCapture.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Cuatro pestañas, en este orden: **Favoritos**, Rápido, Receta, Código. Favoritos es la pestaña por defecto **en cuanto haya al menos uno**; si no, Rápido.

- **Favoritos** — `frequentExtras(memberId)`. Cada uno es un botón de fila con el número de veces, el nombre y las kcal. Un toque registra y cierra.
- **Rápido** — nombre + kcal, dos campos, `inputmode="numeric"` en el de kcal.
- **Receta** — reusa `RecipePickerSheet`; eliges raciones y las kcal salen de `kcalPerServing`. Guarda con `source: 'recipe'` y su `recipeId`.
- **Código** — reusa el escáner de `PantryScanCapture`. **Añade `nutriments` a los campos que se le piden a OpenFoodFacts** (hoy pide `product_name,quantity,product_quantity,product_quantity_unit`, línea 129) y lee `energy-kcal_100g`. Pides los gramos consumidos y calculas. **Si el producto no trae kcal, cae a la pestaña Rápido con el nombre ya puesto** — nunca un callejón sin salida. El código de barras no se guarda: solo sirve para calcular una vez.

El CSP no cambia: `world.openfoodfacts.org` ya está en `connect-src` (`app/public/_headers:5`). Pedir un campo más de la misma API no abre ningún origen nuevo.

Claves nuevas: `intakeAddTitle`, `tabFavourites`, `tabQuick`, `tabRecipe`, `tabBarcode`, `favouritesHint`, `quickName`, `quickKcal`, `gramsEaten`, `noKcalInProduct`, `addToMyDay`.

- [ ] **Step 1: Escribir la hoja, el campo nuevo de OpenFoodFacts y los textos**
- [ ] **Step 2: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): añadir lo que comí por cuatro caminos"
```

---

### Task 12: "Cuenta para" al terminar de cocinar

**Files:**
- Modify: `app/src/sheets/CookFinishSheet.tsx`, `app/src/screens/useCookSession.ts`, `app/src/data/supabaseStore/useIntake.ts` o el store según dónde viva `finishCook`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Diseño aprobado: bajo lo que ya hay, una sección "Cuenta para" con un botón por miembro vivo del hogar — avatar, nombre y su ración. Marcado por defecto a 1 ración; desmarcar pone 0. Y, cuando las raciones cocinadas no cuadran con el número de personas marcadas, un aviso en `--warnsoft`/`--warn-ink` del tipo "Cocinaste 2 raciones y hay 4 personas marcadas".

**El aviso no bloquea.** Avisa y se aparta: el hogar decide, no la app.

`finishCook` pasa a llamar a `finish_cook_v2` mandando `p_shares`. La RPC vieja se queda para los clientes cacheados, pero la app ya no la usa.

Claves nuevas: `countsFor`, `sharesMismatch`, `didNotEat`.

- [ ] **Step 1: Cambiar la hoja, la llamada y los textos**
- [ ] **Step 2: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cook): repartir lo cocinado entre quienes lo comieron"
```

---

### Task 13: "Tu semana"

**Files:**
- Create: `app/src/screens/Week.tsx`
- Modify: `app/src/App.tsx`, `app/src/screens/Today.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Diseño aprobado: siete barras, una por día, contra tu objetivo. Verde (`--accent`) dentro de la banda, `--warn` si te pasaste, `--soft2` si quedaste por debajo, y el día en curso con borde discontinuo porque aún no ha terminado. Debajo, media y objetivo. Después, una tarjeta `--soft` con la racha en grande. Y una nota explicando que hoy no cuenta para la racha todavía. Al pie, la leyenda de los tres colores.

Todo sale de `weekTotalsFor` y `streakOf`: **ninguna aritmética nueva en la pantalla.**

Se entra desde Hoy, con una fila o un botón bajo el anillo.

Claves nuevas: `yourWeek`, `weekAverage`, `weekTarget`, `streakDays`, `streakWithin`, `streakTodayNote`, `legendWithin`, `legendOver`, `legendUnder`.

- [ ] **Step 1: Escribir la pantalla, el enganche y los textos**
- [ ] **Step 2: Gate**

```bash
cd app && npm run lint && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(ui): tu semana con barras y racha"
```

---

### Task 14: Versión, changelog y documentación

**Files:**
- Modify: `CHANGELOG.md`, `CLAUDE.md`, y las versiones vía script

- [ ] **Step 1: Subir la versión**

```bash
node tools/release/bump-version.mjs minor
```

- [ ] **Step 2: CHANGELOG bilingüe**

Tiene que decir, sin prometer de más:

- Cada persona tiene su objetivo de calorías, con una estimación a partir de sexo, edad, altura, peso y actividad. Es una estimación y siempre se puede escribir el número a mano.
- El anillo de Hoy ya cuenta **lo que has comido tú**: las comidas del plan cocinadas, a una ración por persona ajustable, más lo que registres aparte.
- Se puede registrar lo que comes con texto libre, eligiendo una receta, o escaneando un código de barras.
- Al terminar de cocinar se reparte entre quienes lo comieron.
- Tu semana, con la media y la racha de días dentro del objetivo.
- **Cambio de comportamiento:** antes el anillo sumaba las raciones del plato entero; ahora suma tu ración. En un hogar que planifica varias raciones, el número **baja**. No es un fallo: antes contaba mal.
- Y que los datos corporales son privados: no los ve el resto del hogar, y desaparecen si te vas.

- [ ] **Step 3: `CLAUDE.md`**

Actualiza la sección de huecos conocidos: `member_body` y el registro personal **ya no son fase 2 pendiente**, están hechos; quita esa línea y el comentario `FASE 2` de `20260920090200_rezet_member_lifecycle.sql` ya está cubierto por el trigger de `20260921090000`. Añade a la arquitectura que `domain/nutrition.ts` y `domain/intake.ts` son las únicas fuentes de la aritmética de calorías, y que `finish_cook` es un envoltorio de `finish_cook_v2` que existe solo para clientes cacheados.

- [ ] **Step 4: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add -A
git commit -m "Release X.Y.Z"
```

- [ ] **Step 5: Parar**

**No despliegues.** Termina con un informe de lo hecho, lo que quedó fuera, y cualquier cosa que no encajara con el plan.
