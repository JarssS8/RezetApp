# Arreglos de la auditoría de seguridad — diseño

Fecha: 2026-09-17
Origen: auditoría `security-audit` run-1 sobre el commit `a3b789f` (informes en `~/security-audit-skill/Rezet/run-1/`).

## 1. Contexto

La auditoría dejó 8 pistas `needs_validation` (traza de código verificada por dos agentes independientes, sin ejecución local) y 34 notas de refuerzo. Una consulta de solo lectura contra producción confirmó que **las políticas, grants y triggers reales coinciden con las migraciones**, así que los fallos de base de datos están vivos. También confirmó que **no hay señales de abuso**: 2 hogares, 2 perfiles (ambos admin), ninguna referencia `created_by`/`cooked_by` cruzada entre hogares, ninguna invitación abierta, ningún endpoint push fuera de los servicios conocidos, ningún temporizador y 4 fotos huérfanas de 6.

Decisiones tomadas con el usuario:

- Una sola release con todo.
- Invitaciones: solo admins, con revocación automática y lista para admins.
- Fotos huérfanas: limpieza programada.
- Cuota de IA: 50 fotos/día por usuario.
- Cron de notificaciones: secreto propio en cabecera.
- Realtime: clave primaria opaca en `shopping_check`.
- CI: repo de un solo dueño, así que endurecimiento sin Environments.
- Refuerzos incluidos: cabeceras del SPA, limpieza al cerrar sesión, atribución y datos del hogar, errores y logs.
- Pruebas de base de datos: contra producción, con transacciones `ROLLBACK` y migración de reversión preparada.

## 2. Objetivos y no objetivos

**Objetivos**

1. La pertenencia a un hogar y el rol de admin solo se crean por los caminos previstos.
2. Las invitaciones son de servidor: código y caducidad fijos, revocables, y mueren cuando se va quien las creó.
3. Nadie puede bloquear el borrado de cuenta u hogar de otra persona.
4. Nadie puede enumerar las fotos de todos los hogares, y las fotos huérfanas desaparecen.
5. El gasto en Gemini está acotado por identidad, tamaño y cuota.
6. Las notificaciones de temporizador no sirven para hacer peticiones a destinos elegidos por un usuario ni para degradar el servicio de los demás.
7. Realtime no filtra identificadores de otros hogares.
8. CI no despliega desde ramas distintas de `main` y fija sus dependencias.

**No objetivos**

- Rotar el token de komprapp: es de otro proyecto y Rezet no puede regenerarlo. Solo se avisará en la interfaz.
- Cambiar la arquitectura de autenticación, el OAuth del MCP o el modelo de datos del producto.
- Revisar el repo externo de komprapp.

## 3. Diseño

### 3.1 Pertenencia y admin

- `create_household` pasa a `SECURITY DEFINER`, owner `postgres`, `search_path ''`. Ya rechaza a quien tiene perfil, así que el cambio no amplía lo que hace.
- Se borra la política `profile_insert` y se revoca `INSERT` sobre `public.profile` a `authenticated` y `anon`. Un perfil solo nace dentro de `create_household` o `redeem_invite`.
- Se revoca `UPDATE(household_id, is_admin)` sobre `profile` a `authenticated`.
- `private.protect_profile_household` pasa a `BEFORE INSERT OR UPDATE` como red de seguridad.

Invariante: `profile.household_id` y `profile.is_admin` solo los escribe código `SECURITY DEFINER` propiedad de `postgres`.

### 3.2 Invitaciones

- Se revoca `INSERT` sobre `household_invite` a `authenticated`; la política `household_invite_insert` desaparece.
- RPC nueva `create_invite()` (`SECURITY DEFINER`): exige `is_admin` en el hogar del llamante, genera el código con el default actual, fija `expires_at = now() + interval '7 days'`, y antes marca como caducadas las invitaciones sin usar del hogar. Devuelve `code`, `id` y `expires_at`.
- RPC nueva `revoke_invite(p_id uuid)` (`SECURITY DEFINER`): solo admins del hogar de la invitación; marca `expires_at = now()`.
- `leave_household` y `delete_account` caducan las invitaciones sin usar creadas por quien se va, antes de tocar `created_by`.
- `redeem_invite` no cambia.

Cliente: `InviteSheet` llama a `create_invite()`; la entrada de invitar solo se ofrece a admins; `HouseholdSheet` lista para admins las invitaciones pendientes con botón de revocar. Textos nuevos en `es.ts`/`en.ts`.

Invariante: una invitación válida implica que un admin la creó hace menos de 7 días y que sigue en el hogar.

### 3.3 Atribución e integridad

- Trigger `BEFORE INSERT OR UPDATE` en `recipe` y `cook_log` que fuerza `created_by`/`cooked_by = auth.uid()` cuando el llamante no es `postgres`; se revoca esas columnas del grant de INSERT/UPDATE. `save_recipe` (`20260915165859:54`) y `finish_cook` (`20260915141642:240`) ya insertan `auth.uid()` en esas columnas, así que el trigger es transparente para ellas.
- `save_recipe` valida `photo_path`: debe empezar por `<household_id>/` y no contener `..`.
- `finish_cook` bloquea `plan_entry` con `FOR UPDATE` antes de decidir si ya estaba cocinada.
- `leave_household` y `delete_account` bloquean la fila de `household` antes de contar admins y miembros.
- Se retira el grant de `UPDATE` sobre `household` a `anon`, y a `authenticated` se le dejan solo `name` y `kcal_target`.

Invariante: ninguna fila de un hogar puede referenciar el perfil de otro hogar, así que las RPC de ciclo de vida no pueden quedar bloqueadas por terceros.

### 3.4 Fotos

- Se borra la política `recipe_photos_read` sobre `storage.objects`. El bucket sigue público, así que `getPublicUrl` no cambia; lo que se pierde es la enumeración.
- Edge Function nueva `cleanup-orphan-photos`: con la service role, recorre el bucket y borra por la API de Storage los objetos con más de 24 h que no aparezcan en `recipe.photo_path`. `pg_cron` diario, autenticada con el mismo secreto de cabecera que `send-timer-notifications`.

### 3.5 `recognize-pantry-item`

- Exige perfil con hogar, no solo sesión.
- Valida tamaño (≤ 1,5 MB de base64) y `mimeType` en {jpeg, png, webp}.
- Tabla `ai_usage(profile_id, day, count)` con RLS activada y sin políticas (solo service role). La función incrementa y responde 429 al superar 50/día por usuario; la app muestra el mensaje.
- Deja de loguear el cuerpo de Gemini y el texto del modelo; CORS limitado al origen de la app.

### 3.6 `send-timer-notifications`

- Secreto propio (`timer_cron_secret`) en Vault y en los secretos de la función, enviado por `pg_cron` en cabecera; la función rechaza lo demás con 401.
- Lista blanca de hosts push: `CHECK` en `push_subscription.endpoint` y verificación en la función antes de enviar.
- Timeout por envío, tope de filas por ejecución y `notified_at` por temporizador.
- Límite de filas por perfil para `cook_timer` y `push_subscription`.
- Respuestas de error genéricas.

### 3.7 Realtime

- `shopping_check` gana `id uuid primary key default gen_random_uuid()`; `(household_id, item_key)` pasa a `UNIQUE`.
- Ni el cliente ni `buy_checked` cambian de forma: insertan sin `id` y borran por `household_id` + `item_key`.

### 3.8 Cliente y MCP

- `app/public/_headers` con CSP, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` y `Referrer-Policy`. La CSP debe permitir la API, Storage y el WebSocket de Supabase, el proyecto de komprapp, imágenes `data:` y `blob:`.
- `signOut` borra la suscripción push (servidor y navegador), los `cook_timer` propios y las claves `rezet.cook` y `rezet.tab`.
- MCP: `login.ts` escapa `error`/`error_description`; `errors.ts` deja de devolver texto crudo de Postgres; `pantry.ts` filtra por `household_id` en la relectura; el texto de miembros se envuelve en un bloque marcado como no confiable.

### 3.9 CI

- Actions fijadas por SHA completo.
- `if: github.ref == 'refs/heads/main'` en los jobs de despliegue.
- `SUPABASE_DB_URL` solo en el paso que lo usa.
- `app/.env` añadido a `.gitignore`.

## 4. Pruebas

- **Puro:** validación de `photo_path`, lista blanca de hosts push y ventana de cuota diaria, con tests en `app/src/domain/__tests__`; `npm test` verde en `app/` y `mcp/`.
- **Base de datos:** cada caso de ataque se ejecuta contra producción dentro de `begin; set local role authenticated; set local request.jwt.claims = ...; ...; rollback;`, antes y después de la migración. Casos: insertar perfil en hogar ajeno con `is_admin`; salir y auto-promocionarse; crear invitación con caducidad lejana; plantar `created_by` de otro hogar; y los caminos legítimos (`create_household`, `redeem_invite`, `create_invite`, `revoke_invite`) para comprobar que siguen funcionando.
- **Reversión:** migración de vuelta atrás escrita antes de aplicar, con las definiciones actuales capturadas de `pg_policy`, `pg_get_functiondef` y los grants.
- **Manual:** invitar como admin y como no-admin, revocar, subir foto, lista de la compra en dos dispositivos, foto de despensa, temporizador con notificación, exportar a komprapp, y la CSP en `npm run dev`.

## 5. Publicación

- Una migración nueva, con el prefijo de versión que devuelva `apply_migration`, renombrada justo después.
- Versión nueva (minor: invitar pasa a ser solo de admins) con la skill `releasing-versions` y entrada bilingüe en `CHANGELOG.md`.
- Despliegue con la skill `deploying-to-main`, que pide confirmación del usuario.
- Orden: migraciones antes que los Workers. Entre ambos pasos, un cliente viejo que intente crear una invitación fallará; el hueco es de minutos y no afecta a nada más.

## 6. Riesgos

- **Revocar `INSERT` sobre `profile`** rompe el alta de nuevos usuarios si `create_household` no queda bien como `SECURITY DEFINER`. Se prueba con `ROLLBACK` antes de dar por buena la migración.
- **La CSP** puede romper la app en silencio si falta un origen. Se prueba en local y se revisa la consola antes de publicar.
- **El `CHECK` sobre `endpoint`** rechazaría un servicio push nuevo; por eso la lista también vive en la función, que se actualiza sin migración.
- **La limpieza de fotos** borra por path: si alguna vez se guarda una foto sin referencia en `recipe.photo_path`, se la llevaría. El margen de 24 h cubre el alta en curso.

## 7. Estado de ejecución

*(Añadido después de escribir el diseño, sin tocar las secciones anteriores — quedan como registro de las decisiones tomadas en su momento.)*

### Qué se implementó y en qué versión

- **1.6.0** (`docs/superpowers/plans/2026-09-17-security-fixes.md`, 12 commits `5d6041c`..`bb1bd9b`): los 7 hallazgos confirmados por la auditoría run-2 — invitaciones server-minted con caducidad de 7 días, `create_household`/`redeem_invite` como `SECURITY DEFINER`, atribución protegida por trigger, `recipe_photos_read` retirada, cuota y validaciones en `recognize-pantry-item`, `shopping_check` con clave primaria opaca, y refuerzos varios.
- **1.7.0** (`docs/superpowers/plans/2026-09-18-security-fixes-complement.md`, tareas C1-C9, commits `91ccd64`..`e25524f`): lo que este diseño pedía y 1.6.0 dejó fuera — invitaciones restringidas a admins con lista y revocación (§3.2), cierre de los `UPDATE` de columna sobre `profile`/`household` (§3.1, §3.3), validación de `photo_path` y bloqueo de filas en `save_recipe`/`finish_cook`/`leave_household`/`delete_account` (§3.3), cuota de IA realineada a 50/día y CORS/logs acotados en `recognize-pantry-item` (§3.5), secreto de cron y límite de filas por perfil en `send-timer-notifications` (§3.6), limpieza diaria de fotos huérfanas (§3.4), cabeceras de seguridad y limpieza de `signOut` (§3.8), higiene del servidor MCP (§3.8) y endurecimiento de CI (§3.9).

### Las cinco desviaciones deliberadas respecto a este diseño

1. **Dos fases en vez de una sola versión** (§5 pedía una). El usuario lo eligió explícitamente después de escribirse este diseño: una PWA cacheada no puede quedarse con las invitaciones rotas a medio desplegar. **La Fase B se ejecutó el 2026-09-18** (`20260918214500_rezet_phase_b_revoke_invite_insert.sql`, commit `b43840d`): ningún rol conserva `INSERT` sobre `household_invite` y el andamio de compatibilidad ha desaparecido.
2. **El trigger de atribución rechaza en vez de forzar** (§3.3 pedía forzar `created_by`/`cooked_by = auth.uid()`). Lo implementado lanza `REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD` cuando la atribución es de otro hogar: protege lo mismo, falla de forma visible en vez de silenciosa, y ya tiene tests. Por lo mismo, no se revocaron las columnas `created_by`/`cooked_by` del grant de INSERT/UPDATE que pedía §3.3.
3. **Las pruebas de base de datos van contra PGlite, no contra producción con `ROLLBACK`** (§4 pedía lo segundo). El banco de pruebas no toca producción y corre en cada `npm test`, pero es Postgres 18 mientras producción no lo es: un banco en verde no es prueba sobre producción, solo detecta errores de SQL y de lógica.
4. **No se escribió migración de reversión** (§4 la pedía). Cada migración es aditiva y reversible a mano con las definiciones que guardan los ficheros anteriores; si el usuario la quiere, es trabajo aparte.
5. **La cuota vive en `recognition_usage` con ventana móvil**, no en `ai_usage(profile_id, day, count)` como decía §3.5. Equivalente, y ya estaba desplegada en 1.6.0.

Y dos desviaciones más pequeñas, del mismo origen (el plan complementario, no este diseño):

- **`create_invite()` devuelve solo `code`**, mientras §3.2 pedía `code`, `id` y `expires_at`. La lista de invitaciones pendientes se obtiene con una consulta aparte contra `household_invite`, no del valor de retorno de la RPC.
- **`signOut` no borra los `cook_timer` propios**, aunque §3.8 y la tarea C7 lo pedían. `app/src/data/auth.tsx:151-154` lo descarta a propósito y lo razona: el temporizador es del perfil, no del navegador, y borrarlo al cerrar sesión en un dispositivo mataría el aviso en los demás. Sí se borran la suscripción push y las claves locales.
- **`revoke_invite()` caduca la invitación** (`expires_at = now()`) en vez de marcarla como usada, que es lo que dejaba entender §3.2. El efecto es el mismo para `redeem_invite`, y así `used_at` sigue significando solo "alguien la canjeó".
- **Los tests de dominio que pedía §4 para `photo_path` y la ventana de cuota no se escribieron**, porque esa lógica no vive en `domain/` sino en SQL. Ambas acabaron cubiertas igualmente desde el banco de migraciones: "save_recipe rechaza un photo_path de la carpeta de otro hogar" (y sus tres hermanos) y "la cuota de reconocimiento corta al llegar al límite". Lo que sigue sin test es el código Deno de las Edge Functions, que solo pasa `deno check`.

### Sobre la auditoría

La auditoría `security-audit` **run-2** (`~/security-audit-skill/Rezet/run-2/`) es **posterior** a este diseño (que se escribió a partir de run-1) y validó los hallazgos contra la configuración real de producción — políticas, grants y triggers comprobados en vivo, no solo trazados en código.

### Pendiente, acción del propietario

*(Estado a 2026-09-18, comprobado contra producción con consultas de solo lectura.)*

1. ~~**Antes del próximo push a `main`**: borrar la función huérfana `import-idea-photo`.~~ **Hecho**: solo quedan `send-timer-notifications`, `recognize-pantry-item` y `cleanup-orphan-photos`.
2. **Después de desplegar**: copiar el valor de `timer_cron_secret` del Vault al secreto `TIMER_CRON_SECRET` de **ambas** funciones, `send-timer-notifications` y `cleanup-orphan-photos` (se lee con `select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret';`). Hasta entonces, `send-timer-notifications` acepta todo (con aviso en el log) y `cleanup-orphan-photos` no borra nada.
3. **Definir `APP_ORIGIN`** en los secretos de la función `recognize-pantry-item`, para que la lista blanca de CORS apunte al origen de producción real en vez de solo al valor por defecto.
4. **Invocar `cleanup-orphan-photos?dryRun=1` una vez**, a mano, antes de que el cron diario (`17 4 * * *`) la ejecute de verdad — es la única forma de comprobar esta función, que no tiene test ni tipado que la cubra. **Sigue pendiente**: `cron.job_run_details` no tiene ninguna ejecución suya y quedan 4 objetos huérfanos de 6. Ojo con cómo falla: si le falta `TIMER_CRON_SECRET` responde 503, pero el cron se anota como `succeeded` igualmente, porque lo que triunfa es el `net.http_post`. Después de la primera ejecución real, comprobar el código de respuesta con `select status_code, count(*) from net._http_response group by 1`.
5. **Leer** la lista de redirecciones permitidas de Supabase Auth (un comodín ahí es un problema real).
6. **Comprobar el tope de facturación** de la clave de Gemini.
7. **Avisos del linter de Supabase**, ninguno detectado por la auditoría y todos menores:
   - ~~`public.rls_auto_enable()` ejecutable por `anon`/`authenticated`.~~ **Hecho** en la migración de la Fase B, con guarda porque la función solo existe en producción. Era un falso positivo (devuelve `event_trigger`, así que no se puede invocar por RPC), pero deja el linter limpio.
   - **Pendiente, interruptor del dashboard:** protección de contraseñas filtradas desactivada en Auth (**Authentication → Policies / Password protection**).
   - `pg_net` instalada en el esquema `public`: **se deja como está**. La gestiona la plataforma y moverla puede romper `pg_cron` y las dos funciones que dependen de `net.http_post`.
   - `app_secret` y `recognition_usage` con RLS y sin políticas: **es lo buscado**, solo las toca la service role.

Los puntos 2 y 3 no se pueden comprobar con SQL: los secretos de las Edge Functions solo se ven en el dashboard. Las 362 respuestas registradas de `send-timer-notifications` son todas 200, lo que encaja tanto con "secreto configurado" como con "modo tolerante porque falta".
