# Nutrición personal (fase 2) — lo que quedó pendiente

Cierre de `docs/superpowers/plans/2026-09-21-nutricion-personal.md` (rama `feat/nutricion-personal`, versión 1.10.0, 36 commits).

Las 14 tareas se revisaron una a una y la rama entera al final. Se arreglaron **dos Critical** (un doble toque al cocinar que pasaba a devolver `null` donde antes devolvía lista; y que repartir la comida entre dos adultos abortaba la transacción entera, descuento de despensa incluido), y **diez Important** de la revisión final, entre ellos que la estimación de Mifflin-St Jeor no llegaba nunca a aplicarse al objetivo.

Lo que sigue es lo que **a propósito** no se arregló. No es una lista de deseos: es deuda conocida, y cada línea dice qué pasa si se ignora.

## Decisiones de diseño que cambiaron durante la ejecución

- **Las raciones de una comida compartida pasaron de "privado" a "del hogar".** La spec §3.2 las puso en el mismo nivel que los datos corporales, y era un error de categoría: cuántas raciones cenaste de la fuente común lo vio quien cocinó. Con el nivel privado, la pantalla de fin de cocción —que el propio diseño pide— era imposible en cualquier hogar con dos adultos, porque la violación de RLS hacía rollback del descuento de despensa. Lo privado sigue siendo el peso y lo que picas por tu cuenta.
- **`set_member_body` recibe el objetivo ya calculado** en vez de recalcularlo. Implementar Mifflin-St Jeor en PL/pgSQL sería una segunda copia de una regla de negocio que este repo exige tener en `domain/` y solo ahí.

## Aceptado, no hace falta tocarlo

- **`ageFrom` usa solo el año de nacimiento**, así que sobreestima la edad hasta 364 días y alguien de 17 recién cumplidos puede pasar el filtro de adulto. Es consecuencia de guardar solo el año, que es una decisión de privacidad deliberada; el número siempre se puede escribir a mano y esto no es una app médica.
- **`member.kcal_target` es legible por todo el hogar** aunque se derive de datos privados. Deliberado: planificar comida para la casa necesita saber a cuánto apunta cada uno. Lo privado son los insumos, no el resultado.
- **Los comentarios "FASE 2" de `20260920090200`** siguen obsoletos. Esa migración ya está aplicada en producción y este repo no edita migraciones aplicadas; la aclaración vive en la cabecera de la migración nueva.

## Deuda con fecha de caducidad

- **La pila de hojas de `app/src/ui/Sheet.tsx` asume que la última en montarse es la de arriba.** Hoy es cierto porque el único anidamiento abre la hoja hija por interacción, en otro commit. Si alguien anida dos hojas que se monten a la vez, React ejecuta el efecto del hijo **antes** que el del padre y el orden queda invertido: Escape cerraría la de abajo y la visible quedaría sorda. Está avisado en el propio fichero y en `CLAUDE.md`.
- **`intake_share.updated_at` no tiene trigger que lo mantenga.** Solo `finish_cook_v2` la pone al día; las escrituras directas de ajustar tu ración desde Hoy la dejan mintiendo. Es un dato que alguien acabará leyendo.
- **El conteo de `finish_cook_v2` compara contra todas las filas de esa comida**, no contra las que se acaban de mandar. Hoy es inalcanzable, porque una comida ya cocinada sale por el retorno temprano. El día que se permita ajustar la ración antes de cocinar, o "descocinar", vuelve a ser el Critical que ya se arregló una vez.
- **Falta el `check` de que `source = 'recipe'` implica `recipe_id` no nulo.**

## Divergencias entre la demo y la capa real, hoy inertes

- Borrar una comida del plan no limpia las raciones en la demo (la real va por cascada).
- El fin de cocción de la demo reescribe las raciones también en la rama "ya cocinada"; la real no las toca.
- La demo no acota los extras por fecha y la real sí (±1 semana), así que en real los favoritos solo ven unas tres semanas de historia.
- La demo no limpia los datos corporales al borrar un tutelado; la real lo hace por trigger.

## Deuda de forma

- **`app/src/data/store.tsx` pasa de 736 líneas** sin partirse, mientras la capa real sí separó `useIntake.ts`.
- Los mapeos de fila de `useIntake.ts` castean campo a campo en vez de usar una función de fila tipada como `rows.ts`.
- `rezet_log_intake` valida el rango de kcal con literales en vez de importar las constantes del dominio. Los valores coinciden hoy.
- `MemberSettingsPatch.kcalTarget` quedó muerto.
- El segmentado compartido mide 38 px, por debajo de los 44 recomendados. Es componente preexistente de toda la app.
- `setShare` es fire-and-forget sin actualización optimista: el segmentado no se mueve hasta que vuelve el refetch, y si la escritura falla no se entera nadie.
- Quedan multiplicaciones sueltas de kcal fuera de `domain/` (`Today.tsx`, `IntakeAddSheet.tsx`, `RecipeDetail.tsx`), preexistentes a esta fase. Hoy son solo presentación y no entran en ningún total; si alguna vez se suman, reintroducen el fallo de dos fuentes de verdad.

## Tests que faltan

- **No hay infraestructura de tests de React** (solo vitest, sin jsdom ni testing-library). Eso deja sin red de seguridad automática: el orden de efectos de `PrefsBridge.tsx`, la resincronía de `MemberTargetSheet.tsx` —que ya tuvo un fallo de borrado silencioso— y la pila de hojas de `Sheet.tsx`. Adoptarla es una decisión de dependencias del dueño del proyecto.
- Falta el test de `planned` con comidas y extras a la vez, y el de objetivo negativo.
- `CookFinishSheet` no tiene test de componente; la lógica de riesgo real sí está cubierta en el banco de migraciones.

## Pendiente de una persona, no de una máquina

**Nadie ha abierto esto en un navegador.** Sigue siendo el hueco de las dos fases. Lo que yo miraría primero: rellenar los datos corporales y comprobar que el botón de usar la estimación hace lo que dice; cocinar algo y repartirlo entre dos personas; registrar un extra por cada uno de los cuatro caminos; y ver "Tu semana" un lunes, para comprobar que los días que no han llegado se ven como huecos y no como días de comer poco.
