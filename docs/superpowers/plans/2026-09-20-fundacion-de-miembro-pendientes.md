# Fundación de miembro — lo que quedó pendiente

Cierre de `docs/superpowers/plans/2026-09-20-fundacion-de-miembro.md` (rama `feat/fundacion-de-miembro`, versión 1.9.0).

Todas las tareas se revisaron una a una y la rama entera al final. Se arreglaron dos Critical, varios Important y una ronda final de siete bloques. Lo que sigue es lo que **a propósito** no se arregló, con el motivo. No es una lista de deseos: es deuda conocida, y cada línea dice qué pasa si se ignora.

## Aceptado, no hace falta tocarlo

- **`create_ward_member` y `delete_ward_member` leen `household_id`/`is_admin` de `profile`** en vez de llamar a `private.current_household()`. Es una lectura en vez de dos y el hogar sigue sin venir por parámetro, así que no hay riesgo; solo diverge del patrón del resto del esquema.
- **El test de "solo un admin crea tutelados" se apoya en la atomicidad** de la sentencia en vez de comprobar que la fila rechazada no existe. La atomicidad de Postgres es real.
- **`delete_household` consolidó dos `revoke` en uno.** Equivalente.

## Diferido con motivo

- **`PrefsBridge.tsx` no tiene ningún test que fije el orden de sus efectos**, y ya tuvo un fallo de carrera ahí (el efecto de escritura se disparaba antes de que volviera la lectura, pisando los ajustes de la cuenta con los del dispositivo). El repo no tiene jsdom ni testing-library, solo vitest: añadir infraestructura de tests de React es una decisión de dependencias que corresponde al dueño del proyecto. **Si alguien toca ese fichero, que lo sepa.**
- **Si el usuario cambia un ajuste mientras la lectura inicial está en vuelo, la hidratación lo pisa y nunca se sube.** La ventana es el `select` inicial (sub-segundo, al iniciar sesión o en el remonte onboarding→app) y el usuario *ve* cómo su ajuste se revierte, así que puede repetirlo. La mitigación exige lógica de mezcla campo a campo en un componente que acaba de demostrar lo fácil que es equivocarse con el orden, y sin ninguna red de tests.
- **El bloqueo de edición en `MemberSheet` usa `opacity` + `pointerEvents: none`**, que impide el ratón pero no el foco por teclado. El botón de guardar sí está `disabled`, así que no se puede guardar nada, pero quien navegue tabulando puede escribir en campos que no le sirven. Lo correcto es `disabled` en los propios controles (`README.md` §8 lo respalda).
- **`MemberRow.color` se tipa `string` y se castea a `Accent`**, mientras que `rows.ts` sí tipa directamente `food_group` y `difficulty`. Va junto con mover `mapMember` de `useMembers.ts` a `rows.ts`, donde viven los demás mapeadores.
- **Duplicación de "quién soy / soy admin"** entre `HouseholdSheet.tsx` y `MemberSheet.tsx`: las mismas tres líneas. Con un tercer sitio, toca extraerla.
- **La compresión con `canvas.toBlob`** está duplicada entre `MemberSheet.tsx` y `PantryScanCapture.tsx`. Regla de tres: con el tercero, helper compartido.
- **Estilo de export mixto** en `src/data/supabaseStore/rows.ts` (unos inline, otros en bloque al final).
- **Mensajes de error solo en español.** `householdErrors.ts` quita la etiqueta `REZET_*` y deja la prosa del servidor, así que un usuario con la app en inglés ve el mensaje en castellano. Es un patrón anterior a esta rama, pero esta rama le suma seis mensajes nuevos.
- **Errores crudos de Postgres que llegan al aviso de la interfaz**: `create_ward_member` con un nombre vacío viola un `not null` sin etiqueta `REZET_`, y `set_member_settings` con un `kcal_target` no numérico revienta en el cast. El limpiador de errores no sabe traducirlos.
- **La rama `REZET_MEMBER_HAS_ACCOUNT` de `delete_ward_member` es inalcanzable para su caso previsto**: apuntar a un adulto ajeno falla antes en `can_act_for`. Su test usa `rejects.toThrow()` sin comprobar el mensaje, así que pasa por el motivo equivocado. Asertar la etiqueta y decidir si esa rama sobra.
- **Cualquier miembro del hogar puede sobrescribir o borrar el *objeto* del avatar de otro adulto** (las políticas `avatars_update`/`avatars_delete` acotan por carpeta de hogar, no por miembro), aunque no puede cambiar su `avatar_path`. El efecto es dejarle a alguien el avatar roto. Cosmético y dentro del mismo hogar.
- **Quitar un tutelado no pide confirmación**, mientras que quitar a alguien con cuenta sí. Es borrado lógico, reversible solo con SQL.
- **`private.current_member()` no lo usa nadie todavía** ni tiene test. Lo pide el diseño §5.1 para las fases siguientes; hoy es código muerto.
- **Faltan dos tests en el banco**: que un no-admin no pueda `delete_ward_member`, y que `sweepBucket` se comporte bien con `requireNonEmptyReferences` (hoy esa función solo la cubre `deno check`, que comprueba tipos, no comportamiento).
- **La spec §3.5 dice "reintento silencioso"** y el código es mejor esfuerzo sin reintento. Lo que hay que corregir es la spec, no el código; y convendría un `console.warn` al fallar, porque si un día se rompe el grant, "los ajustes te siguen" deja de funcionar en silencio.

## Pendiente de una persona, no de una máquina

**Nadie ha abierto esto en un navegador.** El plan pedía una comprobación visual en la Tarea 9; los agentes no pueden hacerla y se sustituyó por `npm run build`. La revisión final encontró por lectura un fallo que esa comprobación habría cazado (la demo enseñaba "Salir del hogar" y "Eliminar hogar", que siempre fallaban) y ya está arreglado, pero **el repaso visual sigue debiéndose**: modo demo → Ajustes → Tu hogar, y con cuenta real el ciclo de crear, editar y quitar un miembro sin cuenta, y la subida de un avatar.

## Lo que queda para la fase 2 (diseño §6)

`member_body`, el registro personal de consumo, y el borrado de los datos corporales al salir del hogar. El punto de enganche exacto está marcado con un comentario `FASE 2` en `20260920090200_rezet_member_lifecycle.sql`. Hoy el anillo de Hoy ya se compara contra el objetivo del miembro, pero el consumo que cuenta sigue siendo el de las comidas del hogar.
