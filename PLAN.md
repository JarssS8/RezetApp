# PLAN.md — Rezet: de frontend con localStorage a app real

Estado de partida: `app/` es un frontend React+TS+Vite completo y funcional (M0, M1, M2 y la mayor parte de M4–M9 de `BUILD_FROM_ZERO.md` ya están hechos), pero todo vive en `localStorage`. Este plan cubre exactamente lo que falta: backend real, auth multi-proveedor con hogares auto-creables, tiempo real, fotos, PWA y notificaciones — sin tocar pantallas salvo donde el nuevo alcance lo exige.

---

## 1. Decisiones técnicas

| Decisión | Elegido | Descartado | Por qué |
|---|---|---|---|
| Backend | **Supabase** (Postgres + Auth + RLS + Storage + Realtime + Edge Functions) | Node/Fastify propio, Firebase | Es el default del documento; Firebase no da SQL relacional (el modelo de datos necesita joins reales: receta→ingrediente→despensa) y un backend propio es más trabajo para una sola persona. |
| Estado de servidor | **TanStack Query** | SWR, RTK Query | Ya estaba en el stack por defecto; da caché + revalidación + mutaciones optimistas de fábrica, que es la pieza que falta para que marcar una casilla siga sintiéndose instantáneo. |
| Tiempo real | **Supabase Realtime** (`postgres_changes`) sobre `pantry_item`, `plan_entry`, `shopping_check`, `recipe*` | WebSocket propio, polling | Pediste que funcione sin refrescar; Realtime de Supabase se activa por tabla sin infraestructura nueva. |
| Storage de fotos | **Supabase Storage** | MinIO, Cloudflare R2 | Confirmaste: si el free tier de Supabase alcanza, se usa ese. El free tier trae 1 GB, de sobra para fotos de platos en una fase inicial. Si algún día se satura, migrar a R2 es un cambio de una sola capa (URLs firmadas), no un rediseño. |
| Auth | **Supabase Auth**: Passkey (WebAuthn) + Google OAuth + Apple Sign In | Auth propio, Auth0/Clerk | Los tres métodos son nativos de Supabase Auth, sin servicio adicional. Apple Sign In además es obligatorio si vas a ofrecer login social y publicas en App Store (regla de Apple), así que sale gratis cumplirla ya. |
| Registro | **Abierto**: cualquiera crea una cuenta y un hogar; unirse a un hogar existente requiere invitación (código/enlace) | Registro cerrado como decía el README original | **Esto es un cambio de alcance deliberado que pediste tú.** El README (§4.1) y `BUILD_FROM_ZERO.md` §1 asumían registro cerrado por invitación desde el principio. Lo sustituyo por: crear cuenta = crear hogar (te conviertes en su único miembro), y una pantalla nueva de "unirse con código" para quien recibe una invitación. Necesita una pantalla que el diseño original no contempla (ver §7 "Qué se añade fuera del README"). |
| Notificaciones de temporizador | **Capacitor Local Notifications en nativo** (prioridad) + **Web Push best-effort en PWA** | Solo push desde servidor para todo | Los temporizadores se guardan como instante de fin absoluto — eso encaja perfecto con una notificación local *programada* en el propio dispositivo, sin red ni servidor. Web Push sí necesita servidor (VAPID + Edge Function que dispare en `endsAt`) y en iOS Safari solo funciona si la PWA está instalada y con restricciones de entrega; lo hago pero con esa expectativa puesta por delante. |
| Estructura del repo | **Mantener el layout actual** (docs de diseño en la raíz, `app/` como único código real) | Anidar todo bajo `design/` como sugiere `PROMPT_CLAUDE_CODE.md` | Ese anidado asume un handoff de solo-documentación hacia un repo de código que aún no existe. Aquí `app/` ya es el código real y funcional; moverlo a `design/app/` y "reescribir desde cero" tiraría trabajo terminado. Los documentos de diseño se quedan en la raíz como referencia, tal como están. |
| Modo demo | **Se mantiene tal cual, sin tocar** — "Ver la demo" sigue entrando con los datos de `seed.ts` en memoria/localStorage, sin backend | Un hogar demo compartido en Supabase | Pediste una opción de demo para enganchar usuarios nuevos; la que ya existe cumple eso sin gastar cuota de base de datos ni arriesgar que alguien la ensucie. Se queda como puerta de entrada sin cuenta. |

---

## 2. Acciones que te tocan a ti (no las puedo hacer yo)

Antes de M1 necesito que hagas esto y me pases las claves:

1. Crear proyecto en [supabase.com](https://supabase.com) (plan Free) → URL + `anon key`.
2. Google Cloud Console → crear credencial OAuth 2.0 (tipo "Web application"), añadir el redirect URI que te dará Supabase Auth → Client ID + Secret.
3. Apple Developer → Sign in with Apple: crear un Services ID, configurarlo con el dominio y redirect de Supabase, generar la key → Client ID + Team ID + Key ID + `.p8`.
4. Confirmar si ya tienes dominio propio (afecta a los redirect URLs de OAuth y al manifest de la PWA) o si arrancamos con el dominio que da Supabase/Vercel/Netlify.

---

## 3. Árbol de carpetas final

```
Rezet/
  README.md  BUILD_FROM_ZERO.md  INDEX.md  tokens.css  motion.js  RezetApp.dc.html   ← referencia, sin tocar
  CLAUDE.md
  PLAN.md
  app/
    src/
      domain/            ← SIN CAMBIOS, se reutiliza tal cual (puro, con tests)
      data/
        store.tsx         ← REESCRITO: queries+mutaciones Supabase vía TanStack Query, optimistas
        supabaseClient.ts  ← nuevo
        seed.ts            ← SIN CAMBIOS (alimenta el modo demo Y el script de seed de la BD)
      store/               ← prefs.tsx sin cambios
      motion/              ← sin cambios
      ui/                  ← sin cambios
      screens/
        Login.tsx                    ← reescrito: passkey + Google + Apple, ya no un único botón
        CreateOrJoinHousehold.tsx    ← NUEVO
        (el resto: sin cambios de lógica, solo pasan a leer del store nuevo)
      sheets/
        InviteSheet.tsx      ← NUEVO (generar/copiar código de invitación)
        (resto sin cambios)
      i18n/                ← se añaden claves nuevas (auth, invitación, notificaciones), no se tocan las existentes
      hooks/               ← + useRealtimeSync.ts, + usePushPermission.ts (nuevos)
      app/                 ← AppShell sin cambios
    supabase/
      migrations/          ← NUEVO: esquema §4, RLS, funciones RPC
      functions/           ← NUEVO: edge functions (invitaciones, disparo de push)
      seed.sql             ← NUEVO: carga inicial desde seed.ts
    public/
      manifest.webmanifest, iconos  ← NUEVO (PWA)
    capacitor.config.ts    ← existente, se usa en M9
```

---

## 4. Esquema de base de datos

Parte del esquema de `BUILD_FROM_ZERO.md` §3 (Postgres, RLS por `household_id`) con dos tablas nuevas para soportar hogares auto-creados con invitación y notificaciones:

- `household`, `profile`, `ingredient`, `recipe`, `recipe_tag`, `recipe_ingredient`, `recipe_step`, `recipe_step_ingredient`, `pantry_item`, `plan_entry`, `cook_log`, `shopping_check` — **tal cual §3**, corrigiendo la línea inválida `primary key_hint` de `recipe_step` como ya advierte el propio documento.
- **`household_invite`** *(nueva)*:
  ```sql
  create table household_invite (
    id            uuid primary key default gen_random_uuid(),
    household_id  uuid not null references household(id) on delete cascade,
    code          text not null unique,        -- código corto, ej. 8 chars base32
    created_by    uuid references profile(id),
    expires_at    timestamptz not null default now() + interval '7 days',
    used_by       uuid references profile(id),
    used_at       timestamptz
  );
  ```
  RLS: solo miembros del hogar pueden crear/ver invitaciones de su propio hogar; canjear un código es una RPC `security definer` que no depende de RLS (el que canjea aún no pertenece al hogar).
- **`push_subscription`** *(nueva, para Web Push)*:
  ```sql
  create table push_subscription (
    id           uuid primary key default gen_random_uuid(),
    profile_id   uuid not null references profile(id) on delete cascade,
    endpoint     text not null unique,
    p256dh       text not null,
    auth         text not null,
    created_at   timestamptz not null default now()
  );
  ```
  RLS: cada perfil solo ve/borra sus propias suscripciones.

Realtime: se activa replicación (`alter publication supabase_realtime add table ...`) en `pantry_item`, `plan_entry`, `shopping_check`, `recipe`, `recipe_ingredient` — todo lo que dos personas del mismo hogar pueden ver cambiar en vivo.

---

## 5. Funciones de servidor (RPC / Edge Functions)

| Función | Tipo | Qué hace |
|---|---|---|
| `rpc/finish_cook(recipe_id, servings, plan_entry_id)` | Postgres function, transaccional | Contrato exacto de `BUILD_FROM_ZERO.md` §5: resta despensa, incrementa `cooked_count`, marca/crea `plan_entry`, inserta `cook_log`, devuelve `shortages`. |
| `rpc/buy_checked(items[])` | Postgres function, transaccional | Suma a `pantry_item`, borra `shopping_check`, todo o nada. |
| `rpc/save_recipe(payload)` | Postgres function, transaccional | Upsert de receta+ingredientes+pasos+tags, resuelve/crea ingredientes por nombre. |
| `rpc/create_household(name)` | Postgres function | Crea `household` + `profile` del que llama como único miembro. |
| `rpc/redeem_invite(code)` | Postgres function, `security definer` | Valida código no caducado/no usado, crea `profile` del que llama en ese `household_id`, marca la invitación usada. |
| `rpc/create_invite()` | Postgres function | Genera un `household_invite` para el hogar del que llama. |
| Edge Function `dispatch-timer-push` | Deno, disparada por `pg_cron` cada minuto | Busca temporizadores cuyo `endsAt` cayó en el último minuto (tabla ligera del lado cliente que se sincroniza, o se pasa `endsAt` al programar) y envía Web Push a las suscripciones del hogar. |
| Resto de lecturas (lista de recetas, detalle, despensa, semana, hoy) | Consultas directas con RLS desde el cliente | Sin función nueva, tal como dice §5 "El resto, consultas normales". |

---

## 6. Hitos

Cada uno entrega algo que se abre y se prueba; no se encadena el siguiente sin tu visto bueno.

| # | Hito | Entrega | Cómo lo compruebas | Esfuerzo |
|---|---|---|---|---|
| M0 | Proyecto Supabase conectado | `supabaseClient.ts`, variables de entorno, login anónimo de prueba | La app arranca y hace una consulta real a una tabla vacía sin error | 0.5 día (+ tiempo tuyo en §2) |
| M1 | Esquema + RLS + invitaciones | Migraciones aplicadas, `household_invite`, `push_subscription`, funciones `create_household`/`redeem_invite` | Con dos usuarios de prueba en Supabase Studio: uno crea hogar, genera código, el otro lo canjea y aparece en el mismo `household_id`; ninguno ve datos del otro hogar antes de canjear | 1.5 días |
| M2 | Auth real + pantallas nuevas | Login con passkey/Google/Apple, `CreateOrJoinHousehold`, `InviteSheet` | Te registras con Google, creas hogar, invitas a otra cuenta (otro navegador/perfil), esa cuenta se une con el código y ve tu despensa | 2.5 días (+ tiempo de configurar OAuth) |
| M3 | `store.tsx` contra Supabase | Recetas, despensa, plan e ingredientes leen/escriben en la BD real vía TanStack Query, casillas optimistas | Apagas el WiFi tras cargar: la última foto sigue visible (caché); marcar una casilla se ve al instante y se revierte si falla | 3.5 días |
| M4 | RPCs transaccionales | `finish_cook`, `buy_checked`, `save_recipe` conectados | Cocinas una receta real: la despensa baja exactamente lo escalado en la base de datos, no en el cliente | 2.5 días |
| M5 | Tiempo real | Suscripciones Realtime en pantry/plan/shopping | Dos pestañas (o tu móvil y tu portátil) logueadas en el mismo hogar: marcas algo en una y cambia sola en la otra, sin recargar | 1.5 días |
| M6 | Fotos de platos | Subida a Supabase Storage desde el formulario de receta | Subes una foto real, sustituye el marcador monoespaciado en detalle y tarjeta | 1 día |
| M7 | PWA | Manifest, service worker, instalable, ícono, caché del shell | Chrome/Android ofrece "Instalar app"; abierta desde el icono, funciona sin el navegador visible | 1 día |
| M8 | Notificaciones — nativo | Capacitor Local Notifications programadas al `endsAt` de cada temporizador | Arrancas un temporizador, cierras la app del todo, la notificación llega a su hora en el dispositivo físico | 2 días (necesita M9 parcial para probar en dispositivo) |
| M8b | Notificaciones — Web Push | VAPID, suscripción desde el navegador, Edge Function + `pg_cron` | En Chrome de escritorio, con la pestaña cerrada, llega la notificación push al terminar un temporizador. **Nota:** en iOS Safari solo si la PWA está instalada en pantalla de inicio (iOS 16.4+); no hay garantía fuera de ese caso | 2.5 días |
| M9 | Empaquetado nativo | Build de iOS y Android con Capacitor, iconos, splash, notificaciones probadas en dispositivo real | Lo abres en tu iPhone/Android desde Xcode/Android Studio y usas el flujo completo | 2–4 días (más lo que tarde la revisión de las stores, fuera de tu control) |
| M10 | Remates | Checklist de accesibilidad y responsive del README §8/§0, verificar que el modo demo sigue intacto | Repasas la app a 390px y escritorio, claro/oscuro, es/en, con y sin sesión | 1 día |

**Total estimado de esfuerzo activo:** ~21–24 días de trabajo enfocado, trabajando solo, sin contar tiempo de espera de revisión de App Store/Google Play ni el tiempo que te tome configurar las cuentas de OAuth.

---

## 7. Qué se añade fuera del README (y por qué)

El README y el prototipo no contemplan hogares auto-creados ni login social, porque asumían registro cerrado. Para cumplir lo que pediste sin inventar un estilo nuevo, estas piezas se construyen con los mismos tokens y primitivos existentes (`Button`, `Card`, `Fields` de `src/ui/`), sin colores ni radios nuevos:

- **Login** gana dos botones secundarios (`var(--surface2)`, mismo alto 48px que "Ver la demo") para Google y Apple, debajo del botón principal de passkey. La nota inferior cambia de "Solo por invitación" a algo como "Crea tu hogar o únete con un código" (copy exacto a definir en M2, en ambos idiomas).
- **`CreateOrJoinHousehold`**: pantalla nueva, mismo estilo que onboarding (tarjeta centrada, `max-width: 400px`), dos opciones: "Crear un hogar" (pide nombre) o "Tengo un código" (input de 8 caracteres).
- **`InviteSheet`**: hoja inferior nueva (mismo patrón que las hojas existentes, radio 26px, `--shadow-l`), muestra el código/enlace generado con un botón "Copiar".

Estas tres piezas se te enseñan en pantalla al llegar a M2 para que las apruebes o me digas qué cambiar, igual que con cualquier duda visual del resto de la app.

---

## 8. Riesgos

| Riesgo | Qué tan probable | Qué hacemos si pasa |
|---|---|---|
| Apple Sign In requiere Services ID + dominio verificado antes de emitir tokens | Alto (siempre es la parte más burocrática) | Lo dejamos para el final de M2; passkey y Google quedan usables desde antes por si se alarga |
| Web Push no llega de forma fiable en iOS Safari incluso instalada | Alto, es una limitación conocida de Apple | Se documenta como limitación conocida (ya reflejado en M8b) y la vía fiable de verdad es M8 (nativo) |
| RLS mal escrita filtra datos entre hogares | Medio, es el error más caro posible aquí | M1 no se da por cerrado sin probarlo con dos usuarios reales en Studio, no de palabra — igual que exige `BUILD_FROM_ZERO.md` §7 M3 |
| Migrar `store.tsx` rompe algún cálculo de dominio al mover la cobertura de "por nombre" a "por id" | Bajo — el frontend ya usa ids, no nombres | Los tests de `domain/` (ya en verde) no cambian; si algo se desvía, se ve ahí primero |
| El alcance de notificaciones (nativo + web push) infla el calendario | Medio | M8 y M8b están separados a propósito: si el tiempo aprieta, se puede enviar con solo M8 (nativo) y dejar M8b para después |

---

## Explicación en llano

Hoy tienes una app que funciona de verdad pero vive solo en el navegador de quien la abre — nada se comparte entre personas ni sobrevive a borrar datos del sitio. Lo que hace este plan es enchufarle una base de datos real (Supabase) por detrás del único archivo que el propio frontend ya señala como punto de conexión (`store.tsx`), sin tocar ni una pantalla más de lo necesario.

El orden importa: primero la base de datos y los permisos (M1) porque si eso está mal, todo lo que se construya encima hereda el fallo de seguridad. Luego el login de verdad con la posibilidad de crear tu propio hogar e invitar gente (M2) — este es el único punto donde me aparto del README original, porque tú decidiste abrir el registro en vez de dejarlo solo por invitación, así que voy a construir dos pantallas nuevas que no estaban en el diseño, con el mismo lenguaje visual que el resto. Después conecto las pantallas existentes a datos reales (M3) y las tres operaciones delicadas —cocinar, comprar, guardar receta— como transacciones de servidor que no pueden quedarse a medias (M4). El tiempo real (M5) es la guinda de "sin refrescar" que pediste: dos móviles del mismo hogar viéndose actualizar solos.

Las notificaciones son la parte más incierta técnicamente: como cocina guarda el temporizador como "hora exacta de fin" y no como "segundos restantes", encaja perfecto con una notificación programada en el propio teléfono cuando la app sea nativa (Capacitor) — eso es robusto y no depende de que tu servidor esté despierto. La versión web (Web Push) la hago también, pero con la advertencia honesta de que en iPhone con Safari tiene limitaciones que no dependen de mí ni de ti, sino de Apple.

Empaquetar para las stores (M9) es lo último porque no tiene sentido publicar algo que aún no tiene backend, y la revisión de Apple/Google puede tardar días sin que puedas acelerarla.

**Quedo aquí, esperando tu aprobación.** Si el plan te parece bien, dime "adelante" y empiezo por M0 (necesito antes que me pases lo del punto §2: URL y `anon key` de Supabase como mínimo; Google/Apple pueden esperar a M2). Si quieres mover algo del orden, cambiar el alcance de notificaciones, o el nombre/copy de las pantallas nuevas, dímelo antes de que toque código.
