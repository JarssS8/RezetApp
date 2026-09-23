# Avisos, gustos y turnos (fases 4, 5 y 7) — lo que quedó pendiente

Cierre de `docs/superpowers/plans/2026-09-21-avisos-gustos-turnos.md` (rama `feat/avisos-gustos-turnos`, versión 1.11.0).

Las nueve tareas se revisaron una a una, la rama entera al final, y después se revisó aparte el emisor de avisos que esa revisión final destapó que faltaba. No hubo ningún **Critical**. Lo que sí hubo, y está arreglado:

- **La hoja de Avisos prometía cuatro avisos y solo funcionaba uno.** No existía emisor para "caduca pronto", "te toca cocinar" ni el recordatorio de registrar, e `isQuiet` era código muerto que nadie importaba. El CHANGELOG ya se lo prometía al usuario por escrito. Ahora existe `send-member-notifications`.
- **Dos suscripciones de tiempo real que no disparaban nunca**: `household` y `shopping_turn` no estaban en la publicación `supabase_realtime`, así que encender los turnos en un dispositivo no llegaba a los demás.
- **"Para ti" enseñaba recetas marcadas "no me gusta"** en un hogar con pocas recetas: el −10 solo las echaba por saturación del top-3.
- **`isQuiet` leía la hora del proceso**, y las Edge Functions corren en UTC: una franja de 23:00 a 08:00 se aplicaba con dos horas de desfase.
- **El recordatorio de registrar saltaba aunque hubieras comido**, en el flujo más común: `finish_cook_v2` no escribe fila de reparto cuando nadie lo toca, y eso se estaba leyendo como "no comió".
- **El tope de envíos por pasada se comía avisos para todo el día**, sin traza y sin reintento.
- **El test que decía proteger los grants de `member_notice_log` no probaba nada.** Ver abajo: es el hallazgo con más alcance de toda la rama.

Lo que sigue es lo que **a propósito** no se arregló. No es una lista de deseos: es deuda conocida, y cada línea dice qué pasa si se ignora.

## Decisiones de diseño tomadas durante la ejecución

- **El interruptor de turnos no está restringido a admin**, ni en la base ni en la interfaz, aunque el plan (Tarea 8) decía que solo lo viera un admin. Este repo reserva el gate de admin para acciones de pertenencia —invitar, promover, quitar—, no para un interruptor informativo, y la spec §10 no lo exigía. La discrepancia se resolvió documentándola como regla nueva en `CLAUDE.md` en vez de parar y preguntar; queda dicho aquí por si alguien la quiere revisar.
- **Un widget apagado no es un widget ausente** — esa decisión es de la fase 3, no de esta, pero nació del mismo tipo de contradicción entre dos frases de la spec.
- **Los avisos valen tres horas desde su hora**, no solo en el minuto exacto. Sin esa ventana, cualquier pasada perdida del cron se come el aviso para todo el día.

## El hallazgo que afecta a todo el repo, no solo a esta rama

**El banco de migraciones no replicaba los privilegios por defecto de Supabase.** En producción, `pg_default_acl` del esquema `public` concede todos los privilegios a `anon`, `authenticated` y `service_role` sobre **cada tabla nueva**. En PGlite no, así que un test que afirmara "este rol no puede tocar esta tabla" pasaba solo — el `permission denied` salía porque el rol nunca había tenido el grant, no porque la migración lo revocara.

Ya está corregido en `harness.ts`, y se comprobó mutando la migración: quitarle el `revoke all` ahora pone el test rojo. **Las 96 pruebas del banco siguen verdes con el cambio**, lo que confirma que los `revoke` del esquema existente están de verdad.

Lo que queda: nadie ha vuelto a mirar con esta lente los tests de grants **anteriores** a esta rama. Puede haber más tests que pasaban por el mismo motivo equivocado. No es urgente —el esquema está bien, como demuestra que todo siga verde— pero un repaso daría más valor a los que ya existen.

## Aceptado, no hace falta tocarlo

- **Los textos de los avisos van fijos en castellano.** `send-timer-notifications` ya lo hacía y esta función lo hereda: no hay i18n en el servidor y montarlo por tres cadenas no compensa. Si alguna vez el hogar deja de ser hispanohablante, esto se nota.
- **`member_notice_log` se escribe aunque el aviso solo llegara a la mitad de los dispositivos de alguien.** Reintentar por dispositivo exigiría un registro por endpoint; el caso es raro y el coste de equivocarse es un aviso perdido.
- **El aviso de "caduca pronto" dice cuántas cosas y nombra la primera**, no la lista entera. Una notificación no es una pantalla.
- **`hourOf` trunca `log_reminder_at` a la hora.** Hoy es inofensivo porque ninguna pantalla expone ese campo (siempre las 21:00). En cuanto se exponga, `21:30` disparará a las 21:05, no a las 21:30: o se redondea la interfaz a horas en punto, o el emisor pasa a comparar minutos.

## Deuda con fecha de caducidad

- **`isAllowedEndpoint`, `ALLOWED_PUSH_HOSTS`, `MAX_SENDS_PER_RUN` y `SEND_TIMEOUT_MS` están duplicados** entre las dos funciones de avisos. Con una tercera función que mande push, toca fichero compartido. Que la lista de hosts permitidos viva en dos sitios es lo más delicado: añadir un host a uno y no al otro se nota solo cuando alguien deja de recibir avisos.
- **El interruptor "te toca cocinar" se ve encendido aunque el hogar tenga los turnos apagados**, que es el valor por defecto. No hay contradicción real —sin turnos no se puede asignar cocinero, así que el aviso nunca sale— pero la hoja promete algo que en ese hogar no existe.
- **`.in("member_id", memberIds)` sin trocear.** La URL de PostgREST crece unos 40 bytes por miembro; con varios cientos de miembros en total se acerca al límite de URL y la consulta empezará a fallar de golpe.
- **El commit `78258f4` documenta un hecho falso sobre PostgREST.** Su mensaje dice que `ingredient:ingredient_id(name_es)` es sintaxis inválida; no lo es (es un embed por columna de FK, con alias, y responde 200 contra producción). El cambio en sí es inocuo y la forma que quedó es más legible. Queda dicho aquí porque el mensaje de un commit es donde alguien irá a buscar la razón.

## Divergencias entre la demo y la capa real, hoy inertes

- La demo no tiene avisos de ningún tipo: no hay push sin cuenta. Los interruptores de la hoja se guardan y no hacen nada, que es lo correcto.
- Los turnos en demo no tienen tiempo real (no hay segundo dispositivo que sincronizar).

## Tests que faltan

- **Ninguna prueba automática de este repo ejecuta las Edge Functions contra un PostgREST real.** El banco prueba SQL y RLS; `due.test.ts` y `quiet.test.ts` prueban la decisión pura. Entre medias queda toda la capa de consultas, y ahí ya se coló un error de sintaxis que `deno check` no ve y que solo habría fallado en producción. Es el hueco más caro de esta rama.
- `bodyFor` (los textos de los tres avisos) no tiene test de contenido.
- Sigue sin haber infraestructura de tests de React, así que `NotifySheet.tsx` —cuyo bloqueo por campo se acaba de reescribir— no tiene red automática.

## Pendiente de una persona, no de una máquina

**Nadie ha abierto esto en un navegador, y nadie ha recibido ninguno de los avisos nuevos.** Lo que hay que mirar después de desplegar, por orden:

1. Disparar `send-member-notifications` a mano una vez y leer la respuesta: si hay un 500 por una consulta mal formada, sale ahí. Es el riesgo concreto que ninguna prueba de este repo puede cubrir.
2. Comprobar en `cron.job` que el trabajo horario quedó programado.
3. Con un hogar de prueba: algo caducando, un turno asignado hoy y el recordatorio encendido a una hora cercana. Ver que llegan los tres, y que **no** llegan dos veces.
4. Poner una franja de silencio que cubra ahora mismo y comprobar que los tres callan — y que un temporizador de cocina sigue sonando.
5. Cocinar algo sin tocar el reparto y comprobar que esa noche **no** llega el recordatorio de registrar.
