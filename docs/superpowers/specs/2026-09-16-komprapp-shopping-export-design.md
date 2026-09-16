# Exportar lista de la compra de Rezet a komprapp

**Fecha**: 2026-09-16
**Estado**: aprobado para plan de implementación

## Contexto

Rezet calcula automáticamente qué falta comprar (plan semanal − despensa,
`domain/shopping.ts::shoppingNeeds`). El usuario también usa otra app propia
para llevar la lista de la compra en el súper — `ShoppingList`
(`/home/jars/Programing/ShoppingList`, nombre coloquial "komprapp",
desplegada en `https://shop.jarsss8.es`). Quiere mandar los items que faltan
de Rezet a esa lista sin copiarlos a mano.

## Descartado: escritura directa a la base de datos de komprapp

La primera versión de este diseño proponía que Rezet llamara directo al
REST de Supabase de komprapp (proyecto Supabase totalmente distinto al de
Rezet) usando la anon key de komprapp horneada en el bundle público de
Rezet. Una revisión (Opus, 2026-09-16) encontró un problema real y
verificado en el repo: las políticas RLS de komprapp en `lists`/`products`
son `USING (true)` — completamente públicas, sin scoping por owner real. La
anon key ya está expuesta en el bundle de komprapp hoy, pero que **Rezet**
también la incluya para escribir datos de sus propios usuarios (ingredientes
del hogar, dato personal) en una base que cualquiera en internet puede leer
o borrar es un problema serio si Rezet crece más allá de un usuario. Además
acopla la arquitectura de un producto comercial al esquema privado de un
repo personal sin versionado ni contrato — si komprapp cambia su esquema o
arregla su RLS, Rezet se rompe.

Ver [[komprapp_integration]] en memoria para los detalles verificados de esa
revisión.

## Diseño elegido: enlace de importación, sin credenciales compartidas

Rezet nunca llama a la base de datos de komprapp. En su lugar construye un
enlace con los items seleccionados codificados en la URL; al abrirlo,
**komprapp mismo** (ya autenticado/con su propia sesión local) decodifica el
payload y añade los items usando su propia acción `addItem()` existente —
exactamente igual que si el usuario los escribiera a mano. Cero llamadas de
red nuevas desde Rezet, cero migración, cero variable de entorno nueva, cero
credencial de un proyecto en el bundle del otro.

### Formato del payload

JSON versionado, para poder cambiar el formato sin romper enlaces viejos:

```json
{ "v": 1, "items": [{ "name": "Tomate", "quantity": 2, "unit": "kg" }] }
```

Codificado como base64url en el fragmento de la URL:
`https://shop.jarsss8.es/#/import/<base64url(JSON)>` — mismo estilo que el
enlace de compartir lista que komprapp ya usa (`#/s/<token>`), en vez de un
`#clave=valor` suelto. El fragmento (`#`) nunca se manda al servidor, así
que no requiere ninguna configuración de rutas/rewrites en el hosting de
komprapp (Vercel, estático).

No colisiona con el flujo existente de "unirse a lista por token"
(`JoinSheet`/`extractToken` en komprapp, que busca `/s/<token>` o
`/shared/<token>`) porque usa un segmento de ruta distinto (`/import/`).

### Lado Rezet

- **`src/domain/komprappExport.ts`** (puro, con test) — dado un
  `ShoppingNeed[]`, produce el payload:
  - `unit` se traduce al vocabulario de komprapp: `g → g`, `ml → ml`,
    `ud → 'paq'` (unidad más cercana que tiene komprapp). `tbsp` no tiene
    equivalente en komprapp — se funde en el nombre como texto
    (`"Sal (2 cucharadas)"`) y el item va sin `unit`/`quantity` numérica
    separada.
  - `category` no se manda nunca: los ~25 rubros de supermercado de
    komprapp no son mapeables 1:1 desde los 3 grupos de Rezet
    (`fresco/seco/conserva`) sin adivinar mal; komprapp ya autoinfiere
    categoría por nombre en su propio `addItem` cuando no se le pasa una.
  - Expone también `buildKomprappImportUrl(items, baseUrl)` que arma la URL
    final.
- **`src/sheets/ShoppingSheet.tsx`** — reutiliza el estado de selección que
  ya existe (`shoppingChecked`/`toggleShoppingCheck`, hoy usado para "mover
  a despensa"). Nuevo botón secundario "Compartir con komprapp", habilitado
  cuando `anyChecked`. Al pulsarlo: construye la URL a partir de los items
  marcados y copia al portapapeles con el mismo patrón que `InviteSheet`
  (`navigator.clipboard.writeText` + toast de confirmación). No usa
  `navigator.share` en esta versión — no hace falta, mismo patrón que ya
  existe en el resto de la app para compartir enlaces.
- Sin nueva tabla, columna, RPC, ni variable de entorno en Rezet.

### Lado komprapp (`ShoppingList` repo)

- Nuevo módulo pequeño (o bloque en `app.jsx`) que, una sola vez al montar,
  revisa `window.location.hash` en busca de `import=`. Si está presente:
  decodifica base64url → JSON, valida la forma (`v === 1`, `items` es
  array), y si es válido guarda el payload en un estado pendiente.
- Nuevo caso `'import'` en el switch de `AppSheets` (`smart-input.jsx`):
  sheet de confirmación que lista los items del payload con checkboxes
  (todos marcados por defecto) sobre la lista actualmente abierta
  (`currentListId`). El usuario puede desmarcar los que no quiera (cubre el
  caso de reabrir el mismo enlace dos veces sin duplicar a mano) y confirma.
- Al confirmar: por cada item marcado, llama al `addItem(name, quantity,
  null, unit ? { unit } : undefined)` que ya existe en `core.jsx` — mismo
  camino que añadir un producto a mano, misma sincronización a Supabase que
  ya tiene esa función, categoría autoinferida gratis.
- Limpia el hash de la URL (`history.replaceState`) tras procesar, para que
  un refresco de página no vuelva a mostrar el sheet de importación.
- No requiere elegir "a qué lista importar" desde Rezet: importa siempre a
  la lista que el usuario tenga abierta en komprapp en ese momento. Si
  quiere otra lista, la cambia en komprapp antes de abrir el enlace. Límite
  v1 aceptado — evita construir un segundo mecanismo de selección de lista
  destino cuando komprapp ya tiene su propio selector de listas.

### Por qué esto resuelve las objeciones de la revisión

- **Sin credenciales ajenas en el bundle de Rezet** — Rezet no incluye la
  anon key de komprapp ni le hace ninguna llamada de red.
- **Sin acoplamiento de esquema** — el contrato es un JSON versionado en una
  URL, no una tabla. Si komprapp cambia de base de datos entera mañana,
  Rezet no se entera mientras el importador siga leyendo el mismo formato
  `v:1`.
- **Reutilizable** — el mismo enlace podría abrirlo cualquier otra app que
  implemente el mismo contrato de importación (Bring!, AnyList, etc.), así
  que deja de ser un puente específico a un repo personal y pasa a ser una
  feature genérica de Rezet ("exportar lista de la compra").
- **Duplicados** — como es un gesto manual (copiar enlace → pegar/abrir →
  confirmar en un sheet con checkboxes), el usuario ve y puede desmarcar
  items antes de confirmar si sospecha que ya los mandó antes. No hace falta
  dedupe automático para este flujo (a diferencia del diseño descartado, que
  escribía en silencio sin ese punto de confirmación).

## Fuera de alcance

- No se toca la RLS de komprapp en este trabajo (es un problema real y
  preexistente del otro repo, pero ortogonal a esta feature — komprapp no
  recibe ninguna llamada nueva de red gracias a este diseño).
- No hay `navigator.share` / Web Share API en v1 — solo copiar al
  portapapeles, igual que el resto de enlaces compartibles de Rezet.
- No hay selector de lista destino en komprapp iniciado desde Rezet — se
  importa a la lista abierta en ese momento.
