# Rezet — construcción desde cero

Este documento es para levantar la app **partiendo de un repositorio vacío**. No asume nada del código anterior.

Se lee junto a `README.md`, que es la especificación visual y de comportamiento. La división es estricta:

| Documento | Responde a |
|---|---|
| `README.md` | Cómo se ve y cómo se comporta cada pantalla. Tokens, tipografía, movimiento, copy. |
| `BUILD_FROM_ZERO.md` (este) | Qué se construye, en qué orden, con qué modelo de datos y con qué contrato de API. |
| `tokens.css` | El sistema de color, copiable tal cual. |
| `motion.js` | La física de interacción, copiable tal cual. |
| `RezetApp.dc.html` | El prototipo funcional. Fuente de verdad ante cualquier duda. |

Regla de oro cuando algo no cuadre: **el prototipo manda sobre el texto, y el texto manda sobre la intuición del implementador.**

---

## 1. Qué es la app

Rezet es una app de un **hogar** (varias personas, un mismo inventario) que resuelve tres cosas encadenadas:

1. **Plan semanal** — qué se come cada día, en cuatro franjas.
2. **Despensa** — qué hay en casa, con cantidades reales.
3. **Cocinar** — guía paso a paso que, al terminar, descuenta de la despensa lo que se ha usado.

El encadenamiento es el producto: el plan menos la despensa da la lista de la compra, y cocinar actualiza la despensa. Si las tres piezas no están conectadas, la app no tiene sentido; es una lista de recetas más.

### Entra en la v1

Cuatro pestañas (Hoy, Recetas, Plan, Despensa), detalle de receta, crear y editar receta, modo cocinar con temporizadores, lista de la compra, login, guía de primeros pasos, ajustes (tema, acento, idioma, unidades).

### No entra en la v1

Registro abierto (es por invitación), roles y permisos dentro del hogar, importar recetas de una URL, escanear códigos de barras, sugerencias automáticas de menú, macros más allá de las calorías, fotos generadas, comentarios o valoraciones, notificaciones push.

Estas exclusiones son deliberadas. Cada una de ellas, metida en la v1, retrasa el bucle plan → cocina → despensa, que es lo único que hay que tener funcionando.

---

## 2. Stack

Este es el stack por defecto del documento. Está elegido para que **una sola persona lo pueda mantener** y para que la mayor parte del trabajo sea de cliente, que es donde vive el valor de este diseño.

| Capa | Elección | Por qué |
|---|---|---|
| Cliente | **React + TypeScript** con Vite | El diseño es intensamente interactivo (arrastre, temporizadores, hojas con física). Una SPA es lo natural. |
| Enrutado | React Router | Cuatro pestañas + vistas apiladas. |
| Estado de servidor | TanStack Query | Caché, revalidación e **actualizaciones optimistas**, que este diseño necesita en cada marca de casilla. |
| Estado de UI | `useState` local + un store mínimo (Zustand) para tema, idioma y unidades | No hace falta más. Nada de Redux. |
| Estilos | **CSS variables de `tokens.css` + CSS Modules** | Los tokens son la fuente de verdad. Sin librería de componentes. |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage) | Quita el 80% del backend: auth con passkeys, multi-tenant por RLS, y las fotos de los platos en Storage. |
| Instalable | PWA (`vite-plugin-pwa`) | Se usa en la cocina, con el móvil apoyado y a veces sin buena señal. |

**Qué se puede cambiar sin tocar el resto del documento:** el backend (Supabase → Node/Fastify + Postgres, o Django, o Rails) siempre que se respete el contrato de la sección 5; y el framework de cliente (React → Vue/Svelte) siempre que se respete la sección 3 del `README.md`.

**Qué NO se puede cambiar:** los tokens, la escala tipográfica, las constantes de movimiento, la arquitectura de navegación y las reglas de negocio. Eso es el producto.

**Prohibido:** cualquier librería de componentes con su propio tema (Material, Ant, Chakra, Bootstrap, shadcn tal cual). Traen radios, alturas, sombras y colores que pisan los de este diseño, y el resultado deja de parecerse. Los primitivos se escriben a mano; son ocho y están descritos en el `README.md`.

---

## 3. Modelo de datos

Postgres. Este esquema es el que hace posibles las reglas de negocio: cantidades por ingrediente, ingredientes sensibles, relación paso→ingredientes y raciones por entrada de plan. Sin esto, medio producto no funciona.

```sql
create type unit          as enum ('g','ml','ud');
create type food_group    as enum ('fresco','seco','conserva');
create type pantry_loc    as enum ('cupboard','fridge','freezer');
create type meal_slot     as enum ('breakfast','lunch','dinner','snack');
create type difficulty    as enum ('easy','medium','hard');

create table household (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kcal_target  int  not null default 2100,
  created_at   timestamptz not null default now()
);

-- El perfil vive aparte del usuario de auth.
create table profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references household(id) on delete cascade,
  display_name  text not null,
  locale        text not null default 'es',      -- 'es' | 'en'
  theme         text not null default 'system',  -- 'system' | 'light' | 'dark'
  accent        text not null default 'green',   -- green | amber | coral | blue
  units         text not null default 'metric',  -- 'metric' | 'imperial'
  onboarded_at  timestamptz
);

-- Alimento canónico. La despensa y las recetas apuntan AQUÍ, nunca a un texto libre:
-- es lo que permite cruzar "lo que pide la receta" con "lo que hay en casa".
create table ingredient (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references household(id) on delete cascade,  -- null = catálogo global
  name_es       text not null,
  name_en       text not null,
  food_group    food_group not null default 'seco',
  default_unit  unit not null default 'g',
  is_sensitive  boolean not null default false,  -- sal, especias: no escalan lineal
  created_at    timestamptz not null default now()
);
create unique index ingredient_name_uq on ingredient (household_id, lower(name_es));

create table recipe (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references household(id) on delete cascade,
  name              text not null,
  description       text not null default '',
  base_servings     int  not null default 2 check (base_servings between 1 and 24),
  minutes           int  not null default 20,
  difficulty        difficulty not null default 'easy',
  kcal_per_serving  int  not null default 450,
  cooked_count      int  not null default 0,
  photo_path        text,                        -- Storage; null = marcador
  created_by        uuid references profile(id),
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);

create table recipe_tag (
  recipe_id uuid not null references recipe(id) on delete cascade,
  tag       text not null,
  primary key (recipe_id, tag)
);

create table recipe_ingredient (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipe(id) on delete cascade,
  ingredient_id uuid not null references ingredient(id),
  quantity      numeric(10,2) not null check (quantity > 0),
  unit          unit not null,
  position      int not null
);
create index on recipe_ingredient (recipe_id, position);

create table recipe_step (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references recipe(id) on delete cascade,
  position       int not null,
  text           text not null,
  timer_minutes  int,                             -- null = sin temporizador
  primary key_hint text generated always as (null) stored  -- (borrar: placeholder ilegal)
);
create index on recipe_step (recipe_id, position);

-- La relación que hace que cada paso muestre SOLO sus ingredientes.
-- Si está vacía para un paso, el cliente cae al emparejado por texto (README §4.9).
create table recipe_step_ingredient (
  step_id              uuid not null references recipe_step(id) on delete cascade,
  recipe_ingredient_id uuid not null references recipe_ingredient(id) on delete cascade,
  primary key (step_id, recipe_ingredient_id)
);

create table pantry_item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  ingredient_id uuid not null references ingredient(id),
  quantity      numeric(10,2) not null check (quantity >= 0),
  unit          unit not null,
  location      pantry_loc not null default 'cupboard',
  expires_on    date,
  updated_at    timestamptz not null default now()
);
create unique index pantry_item_uq on pantry_item (household_id, ingredient_id, unit, location);

create table plan_entry (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references household(id) on delete cascade,
  on_date          date not null,
  slot             meal_slot not null,
  recipe_id        uuid not null references recipe(id) on delete cascade,
  servings         int not null check (servings between 1 and 24),
  cooked_at        timestamptz,                   -- null = pendiente
  servings_cooked  int,
  position         int not null default 0,        -- varias comidas en un mismo hueco
  created_at       timestamptz not null default now()
);
create index on plan_entry (household_id, on_date);

create table cook_log (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references household(id) on delete cascade,
  recipe_id      uuid not null references recipe(id),
  plan_entry_id  uuid references plan_entry(id) on delete set null,
  servings       int not null,
  shortages      jsonb not null default '[]',     -- [{name, quantity, unit}]
  cooked_at      timestamptz not null default now(),
  cooked_by      uuid references profile(id)
);

-- Las marcas de la lista de la compra son compartidas: dos personas
-- en el súper a la vez tienen que ver lo mismo.
create table shopping_check (
  household_id uuid not null references household(id) on delete cascade,
  item_key     text not null,                     -- "nombre|unidad"
  checked_at   timestamptz not null default now(),
  primary key (household_id, item_key)
);
```

**Corrige al copiar:** la línea `primary key_hint` de `recipe_step` es inválida, bórrala. Está aquí para que quede claro que hay que leer el DDL, no pegarlo a ciegas.

### Multi-tenant: una sola regla

Todo se filtra por `household_id`. Con Supabase, se resuelve con RLS y una función:

```sql
create or replace function current_household() returns uuid
language sql stable security definer as $$
  select household_id from profile where id = auth.uid()
$$;

alter table recipe enable row level security;
create policy recipe_rw on recipe
  using (household_id = current_household())
  with check (household_id = current_household());
-- Repetir el mismo par para: ingredient (o household_id is null), recipe_tag
-- (vía recipe), recipe_ingredient, recipe_step, recipe_step_ingredient,
-- pantry_item, plan_entry, cook_log, shopping_check, household, profile.
```

**No dejes ninguna tabla sin RLS.** Una sola tabla sin política filtra el inventario y las recetas de todos los hogares.

---

## 4. Reglas de negocio

Estas cuatro funciones son el corazón de la app y aparecen en tres pantallas cada una. **Van en un módulo puro, sin React y sin acceso a red, con tests.** Si se implementan sueltas en cada componente, se desincronizan y los números dejan de cuadrar entre pantallas.

```ts
// domain/scaling.ts
export function scaleQuantity(
  baseQuantity: number, baseServings: number, servings: number, isSensitive: boolean
): number {
  const factor = servings / baseServings;
  return isSensitive
    ? baseQuantity * Math.pow(factor, 0.55)   // doblar la sal arruina el plato
    : baseQuantity * factor;
}
```

El exponente `0.55` no es negociable ni ajustable por receta. Se aplica **igual** en: detalle de receta, modo cocinar, lista de la compra y descuento de despensa.

```ts
// domain/coverage.ts  — ¿puedo cocinarlo con lo que tengo?
export function isCovered(need: number, inPantry: number): boolean {
  return inPantry >= need * 0.999;   // la tolerancia evita falsos negativos por coma flotante
}
```

```ts
// domain/shopping.ts
// Recorre los 7 días de la semana visible, ignora lo ya cocinado, acumula por
// clave `ingredientId|unit`, resta la despensa y descarta los huecos <= 0.5.
// Agrupa por food_group en el orden: fresco, seco, conserva.
```

```ts
// domain/units.ts
export function formatQuantity(q: number, u: Unit, system: 'metric'|'imperial', locale: 'es'|'en'): string
// imperial: g -> oz / 28.35 ; ml -> fl oz / 29.57 ; ud NO se convierte ("uds" / "pcs")
// redondeo: un decimal, y sin decimal si el resto < 0.05
// miles: toLocaleString con 'es-ES' | 'en-US'
```

### Tests que tienen que pasar antes de escribir una sola pantalla

| Caso | Entrada | Salida esperada |
|---|---|---|
| Escala lineal | 300 g, base 2, a 4 raciones, no sensible | 600 |
| Escala sensible | 2 g de sal, base 2, a 4 raciones | 2.93 (se muestra `2,9 g`) |
| Escala a la baja | 400 g, base 4, a 1 ración | 100 |
| Sensible a la baja | 5 g de sal, base 4, a 1 ración | 2.29 |
| Cobertura justa | necesita 300, hay 300 | cubierto |
| Cobertura por redondeo | necesita 300.0000001, hay 300 | cubierto |
| Cobertura insuficiente | necesita 301, hay 300 | no cubierto |
| Imperial gramos | 300 g | `10.6 oz` |
| Imperial mililitros | 200 ml | `6.8 fl oz` |
| Unidades sueltas | 4 ud, imperial | `4 uds` (sin convertir) |
| Compra descarta migajas | necesita 300.4, hay 300 | no entra en la lista |
| Compra ignora lo cocinado | entrada de plan con `cooked_at` | no suma |

---

## 5. Contrato de API

Con Supabase, la mayoría son consultas directas con RLS. Tres operaciones **tienen que ser transaccionales en el servidor** (funciones RPC), porque tocan varias tablas y no pueden quedarse a medias:

### `rpc/finish_cook`

La operación más delicada de la app.

```
finish_cook(recipe_id, servings, plan_entry_id | null) -> { shortages: [{name, quantity, unit}] }
```

En una sola transacción:
1. Calcula, por cada `recipe_ingredient`, la cantidad escalada con la regla de la sección 4.
2. Resta de `pantry_item` (mismo `ingredient_id` y unidad). **Nunca baja de 0**; los que quedan a 0 se borran. Lo que faltaba se acumula en `shortages`.
3. `recipe.cooked_count += 1`.
4. Si viene `plan_entry_id`: marca `cooked_at = now()` y `servings_cooked = servings`. Si no: **crea** una `plan_entry` de hoy (`lunch` si son antes de las 16:00 locales del hogar, `dinner` si no) ya cocinada.
5. Inserta el `cook_log` con las `shortages`.

Devuelve las `shortages` para que el cliente las pueda mostrar. Idempotencia: si la `plan_entry` ya tenía `cooked_at`, no vuelvas a restar.

### `rpc/buy_checked`

```
buy_checked(items: [{ingredient_id, quantity, unit, location}]) -> void
```
Suma a `pantry_item` (crea el ítem si no existe: `fridge` + `expires_on = hoy + 5 días` si el grupo es `fresco`, `cupboard` sin fecha si no), y borra las `shopping_check` correspondientes. Todo o nada.

### `rpc/save_recipe`

```
save_recipe(payload) -> recipe_id
```
Crea o actualiza receta, etiquetas, ingredientes, pasos y la relación paso→ingrediente de una vez. Resuelve cada nombre de ingrediente contra `ingredient` (case-insensitive) y **crea el que no exista**, marcando `is_sensitive` con la regla de detección del `README.md` §4.6.

### El resto, consultas normales

| Qué | Consulta |
|---|---|
| Recetas de la lista | `recipe` + tags + `count(recipe_ingredient)`, `archived_at is null` |
| Detalle | `recipe` + ingredientes (con el `ingredient` embebido) + pasos + relación paso→ingrediente |
| Despensa | `pantry_item` + `ingredient`, ordenado por ubicación y nombre |
| Semana | `plan_entry` + `recipe` (solo nombre y kcal) entre dos fechas |
| Hoy | la semana filtrada al día, más `household.kcal_target` |

**Cobertura de despensa: se calcula en el cliente.** Necesita despensa + ingredientes de todas las recetas, que ya están en caché, y se recalcula al cambiar las raciones sin ir a la red.

---

## 6. Arquitectura de cliente

```
src/
  domain/          scaling.ts  coverage.ts  shopping.ts  units.ts  dates.ts   ← puro, con tests
  api/             supabase.ts  recipes.ts  pantry.ts  plan.ts  cook.ts       ← una función por consulta
  ui/              Button  Chip  ListRow  Card  Stepper  Checkbox  Eyebrow  Sheet  Toast
  motion/          motion.ts (copia de motion.js)  useSheetDrag  useSlotDrag
  screens/         Today  Recipes  RecipeDetail  RecipeForm  Cook  Plan  Pantry
  sheets/          Settings  Shopping  PantryAdd  RecipePicker  CookFinish  ExitConfirm
  app/             AppShell (sidebar/tabbar)  ThemeProvider  I18nProvider  routes.tsx
  i18n/            es.ts  en.ts
  styles/          tokens.css
```

### Cuatro decisiones de cliente que importan

**1. El breakpoint se mide en cada render, no una vez.**
```ts
const wide = useMediaQuery('(min-width: 900px)');   // suscrito a change, no una foto al montar
```
Medirlo solo al montar falla: el contenedor puede crecer después sin disparar `resize`. Esto ya nos pasó en el prototipo.

**2. Marcar una casilla es optimista, siempre.** Casillas de ingredientes, casillas de la compra, `+`/`−` de despensa: se pintan al instante y se revierten si el servidor falla. Una casilla que tarda 300 ms en marcarse hace que la app se sienta rota, y en la cocina se marcan diez seguidas.

**3. El estado del modo cocinar es local y sobrevive a la recarga.** Fase, paso, casillas y temporizadores viven en el cliente, con espejo en `localStorage` bajo una clave propia. Los temporizadores se guardan como **instante de fin absoluto**, no como segundos restantes: así siguen siendo correctos si la pantalla se apaga o la pestaña se duerme. Solo se manda algo al servidor al terminar (`finish_cook`).

**4. Idioma, tema, acento y unidades se aplican sin recargar.** Tema y acento como atributo y variable en `<html>`; idioma y unidades desde el store. Nada de recargar la página al cambiar de idioma.

---

## 7. Orden de trabajo

Cada hito termina en algo que se puede abrir y probar. No pases al siguiente sin cumplir la aceptación.

### M0 — Andamiaje
Vite + React + TS, ESLint, Prettier, Vitest. `tokens.css` puesto y consumido. `ThemeProvider` con `system/light/dark` y los cuatro acentos.
**Aceptación:** una página en blanco cambia de tema y de acento, y los cuatro acentos se ven correctos en claro y en oscuro.

### M1 — Dominio con tests
`domain/` completo y **los doce tests de la sección 4 en verde**. Sin UI todavía.
**Aceptación:** `npm test` pasa. Este hito es corto y evita la mitad de los bugs posteriores.

### M2 — Primitivos de UI
Los ocho primitivos, con sus estados `:active` (escalas del `README.md` §6.1). Una página de catálogo interna que los muestre todos.
**Aceptación:** los primitivos coinciden en radio, altura, peso y tracking con el prototipo, en ambos temas.

### M3 — Base de datos y auth
Esquema de la sección 3, RLS en **todas** las tablas, seed de la sección 8. Login con passkey y sesión persistente.
**Aceptación:** dos hogares distintos no ven nada el uno del otro (compruébalo con dos sesiones, no de palabra).

### M4 — Shell y navegación
Barra lateral ≥900px / barra inferior translúcida, vistas apiladas, hojas inferiores con `motion.ts` y arrastre real.
**Aceptación:** la hoja se cierra al lanzarla hacia abajo aunque el recorrido sea corto, vuelve con velocidad heredada si no, y se puede agarrar en pleno vuelo.

### M5 — Recetas
Lista con búsqueda y filtros, detalle con raciones en vivo y cobertura, formulario de creación con el parsing de ingredientes.
**Aceptación:** creas una receta escribiendo `300 g lentejas / 1 cebolla / 2 g sal`, sale con tres ingredientes, la sal marcada como sensible, y al subir a 4 raciones la sal va a 2,9 g y no a 4 g.

### M6 — Despensa y Hoy
Despensa agrupada con pasos de cantidad y caducidades. Hoy con anillo de kcal, comidas por franja y "puedes cocinarlo ya".
**Aceptación:** "puedes cocinarlo ya" solo lista recetas con cobertura total, y cambia al tocar el `−` de un ingrediente de la despensa.

### M7 — Plan y compra
Semana en 7 columnas, arrastre a huecos con `data-slot`, lista de la compra calculada, "pasar lo marcado a la despensa".
**Aceptación:** arrastras una receta a un hueco y el destino se resalta **mientras** arrastras; la lista de la compra cuadra a mano con plan menos despensa.

### M8 — Cocinar
Las dos fases, temporizadores por paso que sobreviven a la navegación, sugerencias de paralelo, confirmación de salida, `finish_cook`.
**Aceptación:** arrancas un temporizador de 20 min, saltas dos pasos adelante y atrás, y sigue corriendo sin reiniciarse; al guardar, la despensa baja exactamente lo escalado.

### M9 — Remates
i18n completo (cero cadenas incrustadas), unidades, PWA, foco visible, `aria-label` en los controles de icono, `role="checkbox"`, `aria-live` para los toasts, `prefers-reduced-motion`.
**Aceptación:** la checklist de la sección 0 del `README.md`, en móvil a 390 px y en escritorio.

---

## 8. Datos de arranque

El prototipo trae 8 recetas, 13 ítems de despensa y 11 entradas de plan. **Sácalos de ahí**: están en el objeto `SEEDS` y en `boot()` de `RezetApp.dc.html`, completos, bilingües y con ingredientes sensibles ya marcados. Cárgalos como seed del primer hogar.

Ojo con dos cosas al migrarlos:
- Los ingredientes del prototipo se cruzan **por nombre** porque no tiene base de datos. En el seed, crea primero las filas de `ingredient` y apunta a sus `id`. El cruce por nombre en producción es un bug esperando: "Tomate" y "tomates" serían dos alimentos distintos.
- El objetivo de calorías (2100) va en `household.kcal_target`, no incrustado en el cliente.

---

## 9. CLAUDE.md del repositorio nuevo

Crea este archivo en la raíz del repo antes de escribir código. Es lo que mantiene el rumbo entre sesiones.

```markdown
# Rezet

App de hogar para plan semanal de comidas, despensa y cocinar. React + TS + Vite + Supabase.

## Fuente de verdad del diseño
`design/README.md` (aspecto y comportamiento) y `design/RezetApp.dc.html` (prototipo).
Ante cualquier duda visual, abre el prototipo y cópialo. No improvises valores.

## Reglas que no se negocian
- Los colores salen de `src/styles/tokens.css`. No hay hex sueltos en los componentes.
- `--accent`/`--warn` son RELLENOS. El texto sobre fondo claro o tintado usa `--accent-ink`/`--warn-ink`.
  El texto encima de un relleno de acento usa `--onaccent` (blanco).
- Sin librerías de componentes con tema propio. Los primitivos están en `src/ui/`.
- Las reglas de negocio viven en `src/domain/`, son puras y tienen tests. No se duplica esa lógica en componentes.
- Escalado de ingredientes: exponente 0.55 para los sensibles. Cuatro pantallas usan la MISMA función.
- Área táctil mínima 44px. Contraste de texto mínimo 4.5:1 en ambos temas.
- Toda tabla nueva nace con RLS filtrando por `household_id`.
- Los temporizadores de cocina se guardan como instante de fin absoluto, nunca como segundos restantes.
- El movimiento usa `src/motion/motion.ts`. No metas duraciones a mano donde debería haber un muelle.

## Antes de dar algo por terminado
Compruébalo a 390px y en escritorio, en tema claro y oscuro, en español y en inglés.
```

---

## 10. Prompts para Claude Code

Uno por hito. Están escritos para pegarlos tal cual, en orden, cada uno en su propia sesión o tras un `/clear`. Cada prompt asume que el paquete de diseño está en `design/` dentro del repo.

> **M0** — Crea un proyecto Vite + React + TypeScript con ESLint, Prettier y Vitest. Copia `design/tokens.css` a `src/styles/tokens.css` e impórtalo en el entrypoint. Implementa `ThemeProvider` con tema `system|light|dark` (escuchando `prefers-color-scheme`) y acento `green|amber|coral|blue`, aplicando `document.documentElement.dataset.theme` y `--accent` por `style.setProperty`. Lee `design/README.md` §3 completa antes de empezar y no inventes ningún color que no esté ahí. Hazme una página de prueba con los conmutadores de tema y acento.

> **M1** — Lee `design/BUILD_FROM_ZERO.md` §4 y `design/README.md` §5. Implementa `src/domain/` con `scaling.ts`, `coverage.ts`, `shopping.ts`, `units.ts` y `dates.ts` como módulos puros, sin React ni red. Escribe los tests de Vitest para los doce casos de la tabla de §4 y déjalos en verde. No escribas UI en este paso.

> **M2** — Lee `design/README.md` §3 (tokens, tipografía, radios, alturas) y §6.1 (feedback de presión). Implementa en `src/ui/` los primitivos Button, Chip, ListRow, Card, Stepper, Checkbox, Eyebrow y Sheet con CSS Modules, consumiendo solo variables de `tokens.css`. Respeta las alturas y radios exactos de las tablas. Añade una ruta interna `/catalog` que muestre todos los primitivos en sus estados. Sin librerías de componentes.

> **M3** — Lee `design/BUILD_FROM_ZERO.md` §3 y §8. Crea las migraciones de Supabase con ese esquema exacto (corrige la línea inválida `primary key_hint` de `recipe_step`), activa RLS en **todas** las tablas con la función `current_household()`, y escribe el seed con las 8 recetas, 13 ítems de despensa y 11 entradas de plan que están en el objeto `SEEDS` y en `boot()` de `design/RezetApp.dc.html`, creando primero las filas de `ingredient` y cruzando por id. Añade el login con passkey de Supabase Auth. Demuéstrame con dos sesiones de hogares distintos que ninguno ve datos del otro.

> **M4** — Lee `design/README.md` §2 (navegación y responsive) y §6 (movimiento) completas. Copia `design/motion.js` a `src/motion/motion.ts` con tipos, sin cambiar ninguna constante. Implementa el shell: barra lateral de 232px a partir de 900px medido con `matchMedia` suscrito a `change`, barra inferior translúcida por debajo, vistas apiladas con `pushin`, y hojas inferiores arrastrables usando `attachSheetDrag`. Las cuatro pestañas son Hoy, Recetas, Plan y Despensa; Cocinar NO es una pestaña.

> **M5** — Lee `design/README.md` §4.4, §4.5 y §4.6. Implementa la lista de recetas (búsqueda por nombre e ingrediente, chips de filtro, rejilla `auto-fill minmax(240px,1fr)`), el detalle (raciones en vivo, cobertura, ingredientes con nota de despensa, pasos) y el formulario de creación con los tres campos visibles y el resto detrás de "Más detalles". El parsing de ingredientes y la detección de ingredientes sensibles son los de §4.6, literalmente. Usa `rpc/save_recipe` de `BUILD_FROM_ZERO.md` §5.

> **M6** — Lee `design/README.md` §4.3 y §4.8. Implementa Despensa (agrupada en Armario/Nevera/Congelador, pasos de 1 para unidades y 100 para g/ml, caducidad en `--warn-ink` a 3 días o menos, borrado al llegar a 0) y Hoy (anillo de kcal con el `stroke-dashoffset` de §4.3, comidas agrupadas por franja sin renderizar las vacías, y "puedes cocinarlo ya" con cobertura total, máximo 3). Los `+`/`−` de despensa son optimistas.

> **M7** — Lee `design/README.md` §4.7 y §5.3, y §6.5 para el arrastre. Implementa Plan (semana lunes a domingo, `grid-auto-flow: column` con `minmax(168px,1fr)`, huecos con `data-slot="{fechaISO}|{franja}"`) con arrastre desde el cajón de recetas usando `attachSlotDrag`, resaltando el hueco destino durante el gesto. Implementa la lista de la compra como hoja, calculada con `domain/shopping.ts`, con marcas compartidas en `shopping_check` y `rpc/buy_checked` para pasar lo marcado a la despensa. El fantasma de arrastre lleva `pointer-events: none`.

> **M8** — Lee `design/README.md` §4.9 entera, dos veces. Implementa el modo Cocinar con sus dos fases (`mise` y `steps`), la franja de temporizadores en marcha, un temporizador independiente por paso guardado como instante de fin absoluto que **no se reinicia ni se detiene al navegar**, el bloque "Mientras se hace, puedes" para pasos de 8 minutos o más, el colapsable de siguientes pasos, y la confirmación de salida como única vía de abandono. Usa `recipe_step_ingredient` para los ingredientes de cada paso y cae al emparejado por texto solo si está vacía. Al terminar, llama a `rpc/finish_cook`.

> **M9** — Lee `design/README.md` §7 y §8. Extrae todas las cadenas a `src/i18n/es.ts` y `en.ts` usando los diccionarios `L.es` y `L.en` de `design/RezetApp.dc.html` **sin reescribir ningún texto**. Conmuta idioma y unidades en caliente. Añade PWA con `vite-plugin-pwa`, anillo de foco visible con `--accent`, `aria-label` en todos los controles de icono, `role="checkbox"` con `aria-checked` en las casillas, `role="progressbar"` en la barra de cocina, `aria-live="polite"` para los toasts, foco atrapado en las hojas con cierre por Escape, y la regla de `prefers-reduced-motion`. Después repasa la checklist de §0 del README a 390px y en escritorio, en los dos temas y los dos idiomas, y dime qué falla.

### Cómo evitar que se desvíe

- **Un hito por sesión.** Al terminar, `/clear`. El contexto largo es lo que hace que se olvide de los tokens.
- **Que lea antes de escribir.** Cada prompt empieza por "lee X". Si no lee, improvisa.
- **Revisa el hito contra su aceptación**, no contra la sensación de que funciona.
- **El primer desvío se corrige en el sitio.** Si aparece un hex suelto, un radio inventado o una duración donde iba un muelle, hazlo arreglar antes de seguir: en el hito siguiente ya se habrá copiado a diez sitios.
- Si algo del diseño no cuadra con el código, **para y pregunta**. No dejes que resuelva la ambigüedad por su cuenta.
