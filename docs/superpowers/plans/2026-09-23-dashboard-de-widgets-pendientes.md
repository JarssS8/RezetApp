# Dashboard de widgets (fase 3) — lo que quedó pendiente

Cierre de `docs/superpowers/plans/2026-09-23-dashboard-de-widgets.md` (rama `feat/dashboard-widgets`, versión 1.12.0, 24 commits).

Las nueve tareas se revisaron una a una, y la rama entera al final. Se arregló **un Critical** y **ocho Important** (cuatro de la revisión final y otros cuatro de las tareas), en tres rondas de arreglo con su re-revisión cada una.

Lo que sigue es lo que **a propósito** no se arregló. No es una lista de deseos: es deuda conocida, y cada línea dice qué pasa si se ignora.

## Decisiones que cambiaron la spec durante la ejecución

- **La spec §7 se contradecía y hubo que elegir.** Decía a la vez *"lo ausente está oculto"* y *"los widgets nuevos se añaden al final, visibles"*. Juntas hacen imposible apagar un widget: el normalizador no distingue "lo apagué yo" de "salió en la versión nueva" y reenciende lo que el usuario apagó. Resolución: un widget apagado se guarda con `on: false` y solo lo verdaderamente ausente se trata como nuevo. El formato literal de la spec (array de `{id, w}`) se sigue aceptando al leer.
- **Dos columnas y no tres.** La §7.2 pedía tres desde 900px, pero el contenedor de Hoy es `maxW.today = 600`, así que tres columnas dan 189px cada una: las baldosas de receta (`minmax(200px, 1fr)`) desbordan y el anillo en tamaño "Media" deja 37px para una cifra de 30px. Se implementaron dos. El ancho de Hoy es un token de diseño establecido y `CLAUDE.md` los protege frente a la intuición de quien implementa. **Queda anotado en la propia spec §7.2**; se recupera la tercera columna el día que se ensanche ese token, no antes.
- **El contrato `Store` creció más de lo previsto**, con `dashboardLayoutLoading` y `dashboardLayoutError`. No estaba en el plan, pero sin distinguir "el layout por defecto porque no hay fila" de "el layout por defecto porque todavía no ha llegado (o falló)", la hoja de personalizar pisaba la personalización guardada. Era pérdida de datos, no forma.

## Lo que se aprendió por las malas, y que el siguiente debería saber

Tres cosas se arreglaron mal a la primera y las cazó la re-revisión. Están dichas aquí porque son patrones, no incidentes:

- **`pointerEvents: none` no deshabilita un control.** Bloquea el ratón; no bloquea Tab ni Enter sobre un `<button>` nativo. Ya está como regla no negociable en `CLAUDE.md`. `SegmentedControl` ganó `disabled` de verdad en esta rama; **`MemberSheet` sigue con el patrón malo** (ver abajo).
- **Un componente que pinta `null` no *es* `null`.** Una guarda `if (renderWidget(item) === null)` compila, parece correcta y no hace absolutamente nada, porque `renderWidget` devuelve un elemento de React. El vacío se decide donde se conoce: `domain/dashboard.ts::isWidgetEmpty`.
- **Arreglar un componente compartido es más peligroso que el fallo que arregla.** El arreglo de la capa invisible tocó `useSheetDrag`, que usan las 23 hojas, e introdujo una regresión que dejaba la app entera sin poder cerrar el diálogo. Hizo falta otra ronda. Cualquier cosa que toque `Sheet.tsx` o `useSheetDrag.ts` merece montarse y probarse, no razonarse.

## Aceptado, no hace falta tocarlo

- **`DEFAULT_LAYOUT` asume `turns: true`.** Verificado: solo lo usan su propia definición y su test; ninguna pantalla lo importa. Lo que se usa en todas partes es `normalizeLayout(null, availability)`. Si alguien llega a importarlo en una pantalla, `whose_turn` se colará en un hogar con los turnos apagados.
- **`needsForWeek(0)` ignora el `weekOffset` navegado en Plan.** Es lo correcto para un widget titulado "Para la semana"; puede discrepar del número de la hoja de compra si el usuario dejó Plan navegado a otra semana.
- **La clave de caché del dashboard es por hogar y no por miembro** (`['dashboard', householdId]`), siguiendo el precedente de `notifyPref`. No cruza recargas (no hay persistencia), pero sí cruza un cambio de cuenta dentro de la misma pestaña y dentro del `gcTime` por defecto.
- **Apagar `whose_turn` y después apagar los turnos del hogar pierde ese `on: false`**: al reactivar los turnos vuelve encendido. Es consecuencia coherente de "apagado = no existe", pero no estaba escrito en ningún sitio hasta ahora.

## Deuda con fecha de caducidad

- **`MemberSheet.tsx` sigue bloqueando la edición con `opacity` + `pointerEvents: none`**, que no impide el foco por teclado. Ya estaba anotado desde la fase 1; lo que cambia es que **ahora existe la herramienta** (`SegmentedControl` y `Pressable` admiten `disabled` de verdad), así que ya no hay excusa de "no hay con qué".
- **Un `pointerup` huérfano puede disparar un segundo guardado con la hoja ya cerrada.** Solo por un camino extremo: Escape con el guardado en vuelo, re-agarrar el asa, arrastrar, y que el guardado resuelva a mitad de arrastre. No bloquea nada y el `upsert` es idempotente, pero puede enseñar un aviso de error sobre una hoja que ya no existe.
- **`role="alert"` del estado de error no se anuncia si la hoja se abre con la query ya fallida**, porque la región viva nace junto a su contenedor. Sí se anuncia si falla con la hoja abierta. El texto es visible en los dos casos.
- **La animación de salida es interrumpible otra vez** (se perdió y se recuperó), pero el comentario de `useSheetDrag.ts:80-83` describe mal un caso extremo: dice que la animación arranca con la velocidad del gesto original y el código pasa `0`. En un fichero donde los comentarios son la documentación, importa.
- **Los chips del registro rápido miden 34px** (`height.chip`), por debajo de los 44 del `README` §8. Es el `Chip` de toda la app —Recetas, Plan, Despensa— así que arreglarlo aquí cambia media interfaz. Merece su propia tarea; aquí el toque además registra kcal, que no es un filtro cualquiera.

## Tests

- **Sigue sin haber infraestructura de tests de React en el repo**, y esta fase lo ha notado más que ninguna: la hoja de personalizar, el gesto de arrastre y la rejilla no tienen cobertura automática. **Pero ahora hay una prueba de que es viable**: el último revisor instaló jsdom en una copia y montó `Sheet`, `Today` y `DashboardEditSheet` de verdad, con contrafactuales contra `main`, y así demostró tres arreglos que el razonamiento había dado por buenos sin serlo. Adoptarla es una decisión de dependencias del dueño del proyecto, pero el argumento ya no es teórico.
- **Aviso para quien lo haga**: jsdom pasa a `requestAnimationFrame` una marca de tiempo con origen distinto al de `performance.now()`, así que `spring()` en `motion.ts` integra con `dt` negativo y da valores absurdos. Hay que normalizar el rAF antes de medir nada de física.
- El banco de migraciones ganó el test de que un adulto del mismo hogar no puede **leer** el dashboard ajeno, que faltaba (solo se probaba que no podía escribirlo).

## Pendiente de una persona, no de una máquina

**Nadie ha abierto esto en un navegador.** Es el tercer cierre de fase seguido en el que esto se dice. Lo que yo miraría, por orden:

1. Apagar el anillo, recargar, y comprobar que sigue apagado — que es justo lo que la contradicción de la spec habría roto.
2. Reordenar arrastrando en un móvil de verdad, comprobando que la lista todavía se desplaza con el dedo y que las filas no se solapan.
3. Personalizar el dashboard entero **solo con el tabulador**, sin tocar el ratón. Es el compromiso explícito de esta fase y el que más veces se ha roto durante la ejecución.
4. Encender y apagar los turnos en Ajustes, y ver aparecer y desaparecer "a quién le toca".
5. Estrechar la ventana de 1200 a 400px y comprobar que el orden no cambia en ningún punto y que nada desborda.
