# Importar directo a komprapp (un toque, vinculado por hogar)

**Fecha**: 2026-09-17
**Estado**: aprobado para plan de implementación — reemplaza/extiende el spec de 2026-09-16
**Supersede parcialmente**: `docs/superpowers/specs/2026-09-16-komprapp-shopping-export-design.md`

## Por qué este spec existe

El spec de 2026-09-16 y su implementación (ya mergeadas/en rama, ver
`docs/superpowers/plans/2026-09-16-komprapp-shopping-export.md`) construyeron
un flujo de enlace: Rezet copia un link al portapapeles, el usuario lo pega/abre
en komprapp, confirma en una hoja. Funciona y está probado, pero no es lo que
el usuario pidió realmente: **un botón que importe directo, y que cualquier
miembro del hogar pueda usarlo sin configurar nada cada vez** — el hogar debe
quedar vinculado a una lista concreta de komprapp una vez, y desde ahí
cualquiera en Rezet importa con un toque.

Eso es exactamente la arquitectura A (escritura directa) que se descartó el
2026-09-16 por un problema de seguridad real: las políticas RLS de komprapp en
`lists`/`products` son `USING (true)` — completamente públicas. Si Rezet
llamara al REST de esas tablas directamente, cualquiera con la anon key de
komprapp (pública por diseño) podría leer o borrar la lista de cualquier
usuario de komprapp, no solo la suya.

La resolución (ya apuntada por la revisión de Opus del 2026-09-16, punto 4:
*"Si aun así quieres escritura directa, el orden correcto es: primero arreglar
komprapp... o un RPC `security definer import_items(token, items[])` con rate
limit, y Rezet llama a ese RPC, nunca al REST de tablas"*) es exactamente eso:
**una función de base de datos estrecha, no la tabla abierta.**

## Diseño: RPC de importación en komprapp, sin tocar sus políticas RLS existentes

Rezet nunca lee ni escribe las tablas `lists`/`products` de komprapp
directamente. Llama a una única función nueva:

```sql
import_shopping_items(p_token text, p_items jsonb) RETURNS integer
```

- `SECURITY DEFINER`, `SET search_path = public` (mismo patrón que
  `delete_my_data()` en `supabase/SUPABASE_MIGRATION_DELETE.sql`).
- Busca la lista por token (`SELECT id FROM lists WHERE token = p_token`) —
  mismo lookup que `findListByToken` ya hace desde el cliente. Si no existe:
  `RAISE EXCEPTION 'list not found'`.
- Valida `p_items` en el propio servidor, nunca confía en el cliente:
  - Debe ser un array JSON de máx. **100** elementos — más que eso, la función
    entera falla (no trunca en silencio).
  - Cada item requiere `name` no vacío, recortado a 200 caracteres.
  - `quantity`: numérico positivo o `null`.
  - `unit`: solo se acepta si está en el vocabulario real de komprapp
    (`g`,`kg`,`ml`,`L`,`ud`,`paq` — ver `UNITS` en `src/data.jsx:958`; komprapp
    añadió `ud` para unidades sueltas, por lo que Rezet ya no traduce
    `ud → 'paq'` al exportar); cualquier otro valor se guarda como `null`.
    Nunca se mete texto libre del cliente en la columna `unit`.
- Inserta una fila por item en `products` (`id` generado con
  `gen_random_uuid()`, `category NULL` — se autoinfiere del lado de komprapp
  igual que en el flujo de enlace, no aquí), y devuelve cuántas insertó.
- `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO anon, authenticated;` — se
  concede a `anon` porque Rezet llama con la anon key pública de komprapp, sin
  sesión de usuario de komprapp. Esto no es más débil que el modelo de
  confianza que komprapp **ya tiene**: su función "unirse a una lista" da
  acceso de lectura/escritura completo a quien conozca el token; esta función
  nueva da bastante menos — solo puede **añadir** productos a esa lista
  concreta, nunca leer, renombrar ni borrar nada.
- Esta función **no cambia ni afloja** las políticas RLS existentes en
  `lists`/`products` (ese problema es preexistente y de komprapp, fuera del
  alcance de esta feature) — es una puerta nueva y estrecha, en paralelo,
  cuyo único uso posible es esta función.

**Punto explícito para que Fable lo cuestione**: el token reutilizado es el
mismo `SLIds.shortToken()` (9 caracteres alfanuméricos, ~10^14 combinaciones)
que komprapp ya usa para "unirse a una lista". Aquí lo justificamos porque la
capacidad que otorga (solo insertar) es estrictamente menor que la que ya
otorga el flujo de unión existente (lectura + escritura total) — pero
confírmese si eso es razonamiento suficiente o si esta función necesita algo
más (rate limit por token, límite de tamaño de `name`/payload total, logging).

## Rezet: vincular un hogar a una lista de komprapp

- **Migración nueva en el proyecto de Supabase de Rezet**: `household` gana
  la columna `komprapp_list_token text` (nullable). *Antes de escribir el
  archivo de migración, comprobar el esquema y las migraciones reales en vivo
  con `mcp__supabase__list_tables` / `mcp__supabase__list_migrations` — el
  checkout local de este repo no tiene ninguna carpeta `supabase/` pese a que
  `CLAUDE.md` la documenta, así que el proyecto de Supabase en producción es
  la única fuente de verdad real; crear `supabase/migrations/` si no existe,
  siguiendo la convención de prefijo de versión que `CLAUDE.md` describe.*
- **Nueva función RPC en el proyecto de Rezet** (no una tabla `.update()`
  directa desde el cliente): `set_komprapp_list_token(p_token text)` —
  `SECURITY DEFINER`, valida que `auth.uid()` sea miembro del hogar (mismo
  patrón de autorización que `promote_admin`), y actualiza la fila. Esto seguí
  la convención ya existente del repo: **todas** las mutaciones de `household`
  pasan por una función RPC, nunca por un `.update()` crudo desde
  `supabaseStore.tsx` (ver `promoteAdmin`/`leaveHousehold`/`deleteHousehold`).
- **Contrato `Store`** (`storeContext.ts`): `HouseholdDetail` gana
  `komprappListToken: string | null`. Nueva acción
  `setKomprappListToken(token: string | null): Promise<void>`.
  - Demo (`store.tsx`): usa el mismo patrón ya existente
    `demoHouseholdActionUnavailable` (no hay hogar/backend real que vincular
    en modo demo) — el campo del `DEMO_HOUSEHOLD` queda `null` fijo.
  - Real (`supabaseStore.tsx`): `householdQ` añade `komprapp_list_token` a su
    `select`; nueva mutación (mismo patrón que `promoteAdminMut`) llama al RPC
    y invalida `householdKey`.
- **UI**: nueva fila "Vincular komprapp" en `AccountHouseholdSheet.tsx` (junto
  a "Conectar IA"), abre `KomprappLinkSheet.tsx` nueva (mismo patrón visual
  que `ConnectMcpSheet.tsx`/`InviteSheet.tsx`): input para pegar un token o un
  link completo de komprapp (se extrae el token con una función pura nueva
  que imita el `extractToken` de komprapp — acepta `/s/<token>` o
  `/shared/<token>` o el token pelado), botón guardar, botón desvincular.

## `ShoppingSheet.tsx`: un botón, dos comportamientos

- **Si `household.komprappListToken` está seteado**: el botón pasa a decir
  "Importar a komprapp" y, en vez de construir un link y copiarlo, llama a una
  función nueva en `src/data/komprapp.ts` — `importToKomprapp(token, items)` —
  que abre un segundo `createClient(KOMPRAPP_URL, KOMPRAPP_ANON_KEY)` (mismas
  dos variables de entorno nuevas que se habían descartado el 2026-09-16:
  `VITE_KOMPRAPP_SUPABASE_URL`, `VITE_KOMPRAPP_SUPABASE_ANON_KEY` — ahora sí
  hacen falta porque hay una llamada de red real) y ejecuta
  `.rpc('import_shopping_items', { p_token, p_items })`. Éxito → toast "N
  items importados", sin salir de Rezet. Error (p. ej. lista borrada) →
  toast de error, sin romper nada más.
- **Si no hay token vinculado**: el botón sigue siendo "Compartir con
  komprapp" y hace exactamente lo que ya hace hoy (copiar enlace) — el
  trabajo del 2026-09-16 se queda como fallback de coste cero, no se borra
  nada de lo ya construido y revisado.

## Resultado de la revisión de seguridad (Fable, 2026-09-17)

Confirma que el diseño central es correcto y el `import_shopping_items` no
reabre el agujero — pero con correcciones ya incorporadas al plan de
implementación:

- El token reutilizado **no es un secreto real hoy**: komprapp ya tiene
  `SELECT USING (true)` público en `lists`, así que cualquiera con su anon
  key puede enumerar todos los tokens por REST sin pasar por esta función.
  La nueva RPC es estrictamente menos capaz que lo que ya existe (solo
  inserta, nunca lee/borra), así que no empeora nada — pero no hay que
  presentarla como una protección real del token en ningún sitio.
- SQL endurecido: valida formato de token antes de buscar, rechaza
  `NaN`/`Infinity` en `quantity`, limpia caracteres de control/RTL del
  nombre, limita el tamaño total del payload (no solo el número de items), y
  usa `SET search_path = ''` con nombres de tabla cualificados (`public.…`)
  en vez de `SET search_path = public` — más resistente a hijacking de
  search_path que el precedente `delete_my_data()` que imita.
- Límite de tasa por lista añadido (defensa en profundidad, no arregla el
  problema de fondo de komprapp).
- `set_komprapp_list_token` ahora exige que quien llama sea **admin** del
  hogar, no cualquier miembro — vincula la lista de la compra de todo el
  hogar, mismo nivel de gravedad que `deleteHousehold`.
- El cliente Supabase nuevo de Rezet (para llamar a komprapp) debe
  desactivar `persistSession`/`autoRefreshToken`/`detectSessionInUrl` — por
  defecto competiría con el propio login de Rezet por el mismo callback
  OAuth en la URL.
- El arreglo real de fondo (RLS pública de komprapp) sigue siendo un
  problema de ese repo, no de esta feature — se lo señalamos al usuario
  explícitamente, no solo en un comentario de código.

## Fuera de alcance (igual que el spec anterior)

- No se toca la RLS existente de `lists`/`products` en komprapp — sigue
  siendo un problema preexistente de ese repo, no de esta feature.
- No hay selector de "qué lista de komprapp" más allá de pegar un token —
  un hogar, una lista vinculada.
- El flujo de enlace del 2026-09-16 no se modifica ni se retira.
