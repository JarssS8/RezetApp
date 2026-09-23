# Dietas y alérgenos (fase 6) — plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que al planificar y al abrir una receta se vea quién del hogar puede comerla y quién no, sin que un "no lo sé" se disfrace nunca de "sí".

**Arquitectura:** el catálogo de alérgenos se siembra **por nombre normalizado**, no por id de ingrediente (ver la corrección de la spec, abajo). Un hogar puede corregir o completar las marcas de **sus** ingredientes, y esas correcciones mandan sobre la semilla. Una receta, para un miembro, se resuelve en tres estados —`No apta` / `Sin verificar` / `Apta`— en `domain/diet.ts`, puro y con tests, y ninguna pantalla vuelve a decidirlo.

**Stack:** React 19 + TypeScript, TanStack Query, Supabase (Postgres + RLS), vitest + banco de migraciones PGlite.

**Spec:** `docs/superpowers/specs/2026-09-20-personalizacion-por-miembro-design.md` §8.2, §8.3 y §8.4.

## Corrección a la spec §8.2, comprobada contra producción

La spec dice que las marcas de alérgeno cuelgan del **catálogo global** de ingredientes (`ingredient.household_id is null`), sembrado por migración y de solo lectura para todos.

**Ese catálogo global está vacío.** Comprobado en producción el 23-09-2026:

```
select count(*) filter (where household_id is null) as globales,
       count(*) filter (where household_id is not null) as de_hogar
  from public.ingredient;
-- globales = 0, de_hogar = 90
```

Ninguna migración siembra ingredientes globales, y las únicas rutas que los crean —`save_recipe` y `pantry_add`— insertan siempre con el `household_id` de quien llama. Es decir: **todos** los ingredientes son de un hogar, y una semilla colgada de ids globales no etiquetaría absolutamente nada. Tal cual está escrita, la fase 6 saldría con todas las recetas en "Sin verificar" para siempre.

**Lo que hace este plan en su lugar:** la semilla se guarda en una tabla propia, **indexada por nombre normalizado** (minúsculas, sin acentos, sin plural simple), y se cruza con `ingredient.name_es` / `name_en`. Encima de la semilla, cada hogar puede poner sus propias marcas **por id de ingrediente**, que mandan sobre ella.

Lo que **no** cambia de la spec:

- La semilla la escribe **solo una migración**. Ningún rol tiene INSERT, UPDATE ni DELETE sobre ella. Ese punto de la spec es el importante y se respeta entero: sin él, un usuario del hogar A cambiaría el resultado de "apta / no apta" en el hogar B sobre la harina o los frutos secos, y en una función cuyo caso de uso declarado es la alergia eso no es un fallo de multi-tenancy sino un riesgo de seguridad alimentaria con superficie remota.
- Las correcciones de un hogar solo pueden tocar **ingredientes de ese hogar**, y se guardan con `source = 'user'`.
- Los tres estados, y que "Sin verificar" no cuenta nunca como apta.

## Restricciones globales

- **Las reglas viven en `domain/` y solo ahí.** Ninguna pantalla decide si una receta es apta.
- **Solo tokens de color.** `--warn` es relleno, `--warn-ink` es el texto sobre fondo claro. Un aviso de alérgeno mal contrastado es un aviso que no se lee.
- **Área táctil mínima 44px** (`README.md` §8).
- **Cada cadena nueva, en `es.ts` y en `en.ts`**, en la misma tarea que la introduce.
- **Las dos capas de datos implementan el mismo contrato** (`storeContext.ts` → `store.tsx` y la capa real).
- **El SQL se prueba en el banco de migraciones, nunca contra producción.** Ningún agente ejecuta `apply_migration`, `supabase db push`, `wrangler` ni `git push`.
- **El prefijo de una migración nueva es posterior a la última del repo.** Míralo con `ls app/supabase/migrations | tail -1`.
- **`npm run lint` y `npm test` en verde antes de cada commit.**
- Commits en español, terminados con la línea `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Foco de revisión

1. **Un ingrediente sin marcar no puede leerse como seguro** en ninguna pantalla, ningún filtro y ningún recuento. → Tarea 1 y Tarea 6.
2. **Un hogar no puede cambiar lo que otro hogar ve.** La semilla es de solo lectura para todos los roles de cliente; las correcciones acotan por hogar **y** exigen que el ingrediente sea de ese hogar. → Tarea 2.
3. **Normalizar el nombre es donde se pierden las coincidencias**: acentos, mayúsculas, plurales, y el mismo ingrediente escrito en inglés. Un fallo aquí no rompe nada visiblemente — solo hace que todo salga "Sin verificar". → Tarea 1.
4. **Una receta sin ingredientes** (posible: los pasos y el nombre bastan para guardarla) no puede salir como "Apta". Sin ingredientes no hay nada verificado. → Tarea 1.
5. **Un miembro sin dietas declaradas** no ve ni un aviso en ninguna pantalla: la función no puede volverse ruido para quien no la usa. → Tarea 6.

---

## Estructura de ficheros

**Nuevos**
- `app/src/domain/diet.ts` — lista cerrada de marcas, normalización de nombres, los tres estados.
- `app/src/domain/__tests__/diet.test.ts`
- `app/supabase/migrations/<ts>_rezet_diet_flags.sql` — las tres tablas + RLS + grants.
- `app/supabase/migrations/<ts>_rezet_diet_seed.sql` — la semilla, en su propia migración.
- `app/src/data/supabaseStore/useDiet.ts`
- `app/src/sheets/MemberDietSheet.tsx` — las dietas de una persona.

**Modificados**
- `app/src/types.ts`, `app/src/data/storeContext.ts`, `app/src/data/store.tsx`, `app/src/data/supabaseStore.tsx`, `app/src/data/supabaseStore/keys.ts`
- `app/src/screens/RecipeDetail.tsx`, `app/src/screens/Recipes.tsx`, `app/src/sheets/RecipePickerSheet.tsx`, `app/src/sheets/MemberSheet.tsx`, `app/src/screens/RecipeForm.tsx`
- `app/src/i18n/es.ts`, `app/src/i18n/en.ts`, `app/supabase/tests/migrations.test.ts`

---

## Tarea 1: `domain/diet.ts` — las marcas y los tres estados

**Modelo:** Sonnet.

**Ficheros:** crear `app/src/domain/diet.ts` y `app/src/domain/__tests__/diet.test.ts`.

**Produce** (lo usan las tareas 3 a 6):

- `DIET_FLAGS: readonly DietFlag[]` — la lista cerrada: los 14 de declaración obligatoria de la UE (`gluten`, `crustaceans`, `egg`, `fish`, `peanuts`, `soy`, `dairy`, `nuts`, `celery`, `mustard`, `sesame`, `sulphites`, `lupin`, `molluscs`) más `meat`, `pork`, `alcohol`.
- `normalizeIngredientName(name: string): string`
- `type DietVerdict = 'unfit' | 'unverified' | 'fit'`
- `interface IngredientFlags { flags: readonly DietFlag[]; verified: boolean }`
- `flagsOf(name: string, ingredientId: string, seed: ReadonlyMap<string, readonly DietFlag[]>, overrides: ReadonlyMap<string, readonly DietFlag[]>): IngredientFlags`
- `verdictFor(ingredients: readonly IngredientFlags[], avoided: readonly DietFlag[]): { verdict: DietVerdict; hits: DietFlag[] }`

Reglas, exactamente:

- Una corrección del hogar para ese `ingredientId` **sustituye** a la semilla, no se suma: si alguien marca su "harina" como sin gluten (es de trigo sarraceno), la semilla no puede volver a añadirle el gluten. Una corrección presente implica `verified: true`, aunque su lista de marcas esté vacía.
- Sin corrección y con coincidencia en la semilla: las marcas de la semilla, `verified: true`.
- Sin corrección y sin coincidencia: sin marcas, `verified: false`.
- `verdictFor`: si alguna marca evitada aparece en algún ingrediente → `unfit` (con `hits`). Si no, y **algún** ingrediente tiene `verified: false` → `unverified`. Si no → `fit`.
- **Lista de ingredientes vacía → `unverified`**, nunca `fit`. Sin ingredientes no hay nada verificado.
- `avoided` vacío → `fit` siempre, sin mirar nada: quien no declara dietas no tiene nada que avisar.

`normalizeIngredientName`: pasa a minúsculas, quita acentos (`normalize('NFD')` + quitar los diacríticos), colapsa espacios, y quita una `s` o `es` final. Esa última regla es tosca a propósito: es una heurística de coincidencia, no morfología, y su único fallo posible es no encontrar una marca —lo que da "Sin verificar", el estado conservador— nunca inventar una.

- [ ] **Paso 1: tests que fallan**, cubriendo como mínimo: corrección que sustituye a la semilla (incluida la corrección vacía), coincidencia por acentos y por plural, coincidencia por `name_en`, `unfit` con la marca concreta en `hits`, `unverified` por un solo ingrediente sin marcar aunque el resto esté limpio, receta sin ingredientes, y `avoided` vacío.
- [ ] **Paso 2:** ejecuta `cd app && npx vitest run src/domain/__tests__/diet.test.ts` y confirma que falla por el import.
- [ ] **Paso 3:** escribe `diet.ts`.
- [ ] **Paso 4:** los tests en verde y `npm run lint` limpio.
- [ ] **Paso 5:** commit `feat(domain): marcas de dieta y los tres estados de una receta`, explicando en el cuerpo por qué "Sin verificar" es un estado propio y no un "probablemente sí".

---

## Tarea 2: el esquema

**Modelo:** Sonnet.

**Ficheros:** crear la migración de esquema; modificar `app/supabase/tests/migrations.test.ts`.

```sql
-- La semilla: por NOMBRE, no por id de ingrediente. El catálogo global
-- (`ingredient.household_id is null`) está vacío en producción y nada lo
-- llena, así que una semilla por id no etiquetaría nada. Ver el plan de esta
-- fase.
create table public.diet_seed (
  name_key text primary key,
  flags    text[] not null
);

-- Correcciones del hogar, por id de ingrediente. Sustituyen a la semilla.
create table public.ingredient_diet (
  household_id  uuid not null references public.household(id) on delete cascade,
  ingredient_id uuid not null references public.ingredient(id) on delete cascade,
  flags         text[] not null,
  primary key (ingredient_id)
);

create table public.member_diet (
  member_id uuid not null references public.member(id) on delete cascade,
  flag_key  text not null,
  primary key (member_id, flag_key)
);
```

Reglas de acceso, todas obligatorias:

- `diet_seed`: RLS activada, **una sola política `for select` a `authenticated`** con `using (true)` — todo el mundo la lee. `revoke all ... from anon, authenticated` y después **solo** `grant select`. Ningún rol de cliente puede escribirla; la llena una migración. Deja el comentario que diga por qué, citando el riesgo (un hogar cambiando lo que otro ve sobre la harina o los frutos secos).
- `ingredient_diet`: `for all` a `authenticated` acotando por hogar **y** exigiendo con un `exists` que el ingrediente sea de ese hogar — el mismo patrón de `20260919100400`, porque `ingredient_id` es una FK que puede cruzar hogares. Va en `using` **y** en `with check`: una política `for select` no protege un INSERT, y el `using` solo no protege el `with check`.
- `member_diet`: lectura de hogar (planificar la comida de la casa necesita saber quién no puede comer qué) y escritura por `private.can_act_for(member_id)`. Ojo: son dos políticas de comandos distintos, no una.
- Un `check` sobre `flags` y sobre `flag_key` contra la lista cerrada de 17 marcas, escrita literal en el SQL. Que la lista esté en dos sitios (aquí y en `domain/diet.ts`) es aceptado: cambia solo con una migración, y el `check` es la única barrera real contra una marca inventada.
- Índice en `ingredient_diet(household_id)` y en `member_diet(member_id)`.

Tests del banco, todos por `asUser`:

- un usuario autenticado **no** puede insertar, actualizar ni borrar en `diet_seed`, y sí puede leerla;
- un hogar no puede poner una corrección sobre un ingrediente de otro hogar (rechazado por el `with check`, no solo invisible);
- `member_diet`: todo el hogar lee, solo tú y quien te tutela escribe;
- borrar el miembro o el ingrediente se lleva sus filas;
- una marca fuera de la lista cerrada es rechazada.

- [ ] Paso de mutación obligatorio: quita el `exists` del `with check` de `ingredient_diet`, vuelve a correr el banco y **comprueba que el test de "ingrediente de otro hogar" se pone rojo**. Si sigue verde, el test está mal. Restaura.
- [ ] Commit `feat(db): esquema de dietas y alérgenos`.

---

## Tarea 3: la semilla

**Modelo:** Sonnet. Es donde se decide qué se considera seguro, así que va sola y con su propia revisión.

**Ficheros:** crear la migración de semilla.

Un `insert` con, como mínimo, los ingredientes que de verdad aparecen en las recetas de un hogar español: harina de trigo, pan, pasta, cuscús, cebada, avena; leche, nata, mantequilla, queso, yogur; huevo; almendra, nuez, avellana, pistacho, anacardo; cacahuete; soja, tofu, salsa de soja; gamba, langostino, cangrejo; mejillón, almeja, calamar, pulpo; merluza, atún, bacalao, salmón, anchoa; apio; mostaza; sésamo, tahini; altramuz; vino, cerveza, brandy; cerdo, jamón, chorizo, panceta, bacon; ternera, pollo, cordero, conejo.

Reglas al escribirla:

- La clave es el **nombre normalizado** por la misma regla de `normalizeIngredientName`. Escríbelos ya normalizados (minúsculas, sin acentos, en singular) y deja un comentario recordando que esa regla vive en `domain/diet.ts` y que las dos tienen que coincidir.
- Incluye también las formas en inglés de lo que el catálogo pueda tener en inglés (`flour`, `milk`, `egg`, `peanut`, …).
- `pollo`, `ternera`, `cordero`, `conejo` llevan `meat` pero **no** `pork`; `jamón`, `chorizo`, `panceta`, `bacon` llevan `meat` **y** `pork`.
- El pescado lleva `fish`; las gambas, `crustaceans`; los mejillones y el calamar, `molluscs`. No los mezcles: son tres de los catorce y son alergias distintas.
- **En caso de duda, no marques.** Una marca de menos da "Sin verificar", que es visible y conservador. Una marca de más da un falso "No apta", que enseña a la gente a ignorar el aviso — y ese es el fallo que de verdad hace daño.

- [ ] Commit `feat(db): semilla de alérgenos para los ingredientes de uso común`, diciendo en el cuerpo que ante la duda no se marca y por qué.

---

## Tarea 4: contrato y capas de datos

**Modelo:** Sonnet.

Añade al `Store`:

- `dietSeed: ReadonlyMap<string, readonly DietFlag[]>` — la semilla, cargada una vez.
- `ingredientDiet: ReadonlyMap<string, readonly DietFlag[]>` — correcciones del hogar, por id de ingrediente.
- `memberDiets: ReadonlyMap<MemberId, readonly DietFlag[]>`
- `setMemberDiets: (memberId: MemberId, flags: DietFlag[]) => Promise<void>`
- `setIngredientDiet: (ingredientId: string, flags: DietFlag[]) => Promise<void>`

**Ojo, fallo ya cometido dos veces en este proyecto:** una `queryFn` **no** puede devolver un `Map`. TanStack no comparte estructuralmente un `Map`, así que cambia de identidad en cada refetch y todo lo que dependa de él se re-ejecuta (en la fase 2 eso reseteaba un formulario mientras se escribía). Devuelve un array plano desde la `queryFn` e indexa en un `useMemo` fuera de ella.

La capa demo siembra unas pocas marcas en `seed.ts` para que la demo enseñe los tres estados —uno apto, uno no apto y uno sin verificar—, que es justo lo que hay que poder ver sin cuenta.

- [ ] Commit `feat(data): dietas del miembro y marcas de ingrediente en el contrato Store`.

---

## Tarea 5: declarar tus dietas

**Modelo:** Sonnet.

`MemberDietSheet`: una lista de las 17 marcas con un interruptor cada una, abierta desde `MemberSheet`. Copia en los dos idiomas para cada marca (`gluten` → "Gluten" / "Gluten"; `nuts` → "Frutos secos" / "Tree nuts"; `dairy` → "Lácteos" / "Dairy"; …). Guarda todo junto al cerrar, no marca a marca.

Un texto al pie, en los dos idiomas, que diga sin rodeos lo que esto es y lo que no: **Rezet avisa con lo que tiene etiquetado; no sustituye leer la etiqueta del producto.** No es letra pequeña defensiva, es la verdad de la función — la semilla la escribió una persona y los ingredientes los escribe el hogar.

- [ ] Commit `feat(members): cada persona declara sus dietas y alergias`.

---

## Tarea 6: dónde se ve

**Modelo:** Sonnet.

- **`RecipeDetail`**: una fila por miembro con dietas declaradas — apta, no apta (**con la marca concreta que choca**, no un "no apta" a secas) o sin verificar. Quien no ha declarado nada no aparece.
- **`RecipePickerSheet`** (al planificar): avisa si choca con alguien del hogar. **Avisa, no bloquea** — el hogar decide, y puede que esa noche esa persona no cene en casa.
- **`Recipes`**: dos filtros **distintos y etiquetados distinto**, "apto para todos" y "sin conflictos conocidos". No son lo mismo y juntarlos es exactamente el fallo que §8.3 prohíbe.
- **`RecipeForm`**: al crear un ingrediente nuevo, pide sus marcas **solo si algún miembro del hogar tiene dietas declaradas**. Si nadie las tiene, la función no existe y el formulario no cambia.

Colores: un choque va en `--warn-ink` sobre `--warnsoft`; "sin verificar" va en `--muted`, nunca en `--warn` (no es una alarma) ni en `--accent` (no es una aprobación).

- [ ] Commit `feat(recipes): quién puede comer cada receta`.

---

## Tarea 7: cerrar la fase

**Modelo:** Sonnet.

- `node tools/release/bump-version.mjs minor` desde la raíz.
- Entrada bilingüe en `CHANGELOG.md`, con el mismo formato que las anteriores. **Di con todas las letras que "sin verificar" no quiere decir "apta"** y que Rezet no sustituye a leer la etiqueta. Un changelog que promete más de lo que la función puede dar, en esta función concreta, es el problema.
- `CLAUDE.md`: `domain/diet.ts` en el mapa; una regla no negociable sobre los tres estados y sobre que la semilla solo la escribe una migración; cerrar la fase 6 en "Already done".
- **No despliegues.** Eso pasa por la skill `deploying-to-main` y lo decide el dueño del repo.

---

## Lo que queda para una persona

1. Declarar una alergia a los frutos secos y abrir una receta con almendras: tiene que salir "No apta" nombrando los frutos secos.
2. Crear un ingrediente que no esté en la semilla y comprobar que la receta pasa a "Sin verificar" y **no** a "Apta".
3. Corregir un ingrediente del hogar (una "harina" de trigo sarraceno) y ver que la corrección manda sobre la semilla.
4. Con ningún miembro con dietas declaradas, comprobar que no aparece ni un solo elemento nuevo en ninguna pantalla.
