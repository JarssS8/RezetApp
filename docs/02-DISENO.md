# 02 · Diseño

## Dirección: «Mercado»

Blanco limpio, verde de huerta, esquinas generosas. Moderna pero cálida.
Su modo oscuro es **«Noche suave»**: carbón cálido de madera quemada, crema en vez
de blanco, miel en vez de verde. Mismo componente, otras variables.

Los tokens están en `design-tokens.css`, listos para pegar.

## Qué evitar, y por qué

Una primera versión se hizo con la estética de openGym (app de gimnasio) y se
sintió agresiva. El diagnóstico, para no repetirlo:

- **Negro azulado** (`#0C0E12`): el azul frío es color de herramienta — paneles de
  control, editores de código. En una cocina no mides, cocinas.
- **Contraste altísimo**: perfecto para leer repeticiones entre series,
  innecesariamente duro para leer una receta con calma.
- **Verde ácido** (`#7BD88F`): verde de terminal, de LED. Los acentos salen de
  comida real.
- **Redondeo pequeño con bordes marcados**: sensación de instrumento de precisión.

## Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Títulos | **Outfit** 600/700 | Cabeceras de pantalla (`.title-screen`), títulos de contenido (`.title-content`) y **la cifra protagonista** (`.num-hero`, `.num-lead`) |
| Interfaz | **DM Sans** 400/500/600/700 | Todo el texto corriente |
| Datos | **JetBrains Mono** 500/600 | Cifras **en columna**: cantidades, fechas, tablas, totales pequeños (`.tabular`) |

La cifra protagonista —las kcal cocinadas del anillo de Hoy y las kcal por ración
de la ficha— va en **Outfit con `tabular-nums`**, no en monoespaciada: un número
hero en mono se lee como panel de control, justo lo que esta dirección evita
(ver «Qué evitar»). La monoespaciada se reserva para lo que se compara en
columna, que es donde su ancho fijo sirve para algo. Hasta W6 el mismo dato salía
en las dos familias según la pantalla.

Los números que se comparan en columna llevan `font-variant-numeric: tabular-nums`.
El texto corrido no pasa de ~65 caracteres de ancho.

## Escala de radios

```
--r-lg: 22px   tarjetas y hero
--r-md: 16px   tarjetas internas, campos, tiendas
--r-sm: 12px   botones, chips cuadrados, steppers
píldoras: 20px o 999px
```

En Tailwind se mapean explícitamente `--radius-sm/md/lg/xl` → `--r-sm/--r-md/--r-lg/--r-lg`; no se usa `--radius`.

## Superficie antes que línea

La jerarquía entre una tarjeta y su fondo se lee por **sombra y escalón de
fondo**, no por borde. `--sh-card` y `--sh-hero` son sombras de dos capas
(una de contacto, corta y cerrada; otra de elevación, larga y difusa) — una
sola capa se ve plana o se ve dura, nunca a media distancia.

En «Noche suave» la sombra casi no se distingue sobre el carbón cálido, así
que el borde hace el trabajo que en claro hace la sombra: `--line-2` se queda
**entero** en oscuro (`var(--line)`, sin mezclar) y **casi desaparece** en claro
(`--line` mezclado al 55 % con `--surf`). Es el mismo token cumpliendo dos
papeles distintos según el tema, no una inconsistencia.

`--surf-sunken` (alias de `--surf-2`) es el fondo del agrupador **hundido**:
la caja de `EmptyState` y el hueco vacío de un día sin planificar en el plan.
No es una tarjeta que sobresale, es un hueco que retrocede.

## Acentos elegibles

Ocho, todos sacados de comida y ninguno de neón. El usuario elige uno; es una
variable CSS y un atributo en la raíz.

| Nombre | Hex |
|---|---|
| Huerta (por defecto) | `#2F9E6B` |
| Miel | `#D99A2B` |
| Tomate seco | `#CE5540` |
| Pistacho | `#7FA344` |
| Higo | `#B4557A` |
| Berenjena | `#8C5A9E` |
| Arándano | `#4A7FB5` |
| Canela | `#A9764A` |

`--on-acc` es el color del texto sobre el acento (`--acc`). Depende del
**acento elegido, no del tema**: cada uno de los ocho tiene su propio
`--on-acc`, fijado al valor (tinta oscura o blanco) que cumple AA (≥4,5:1)
sobre ese color concreto — la mayoría usa tinta oscura; higo y berenjena,
al ser los más oscuros, usan blanco. Ver la tabla de `--on-acc` por acento en
`design-tokens.css` y `app/globals.css` (ambos deben decir lo mismo). Nunca
escribas un color de contraste a mano.

`--warn` sirve para bordes, iconos y fondos; el texto pequeño de aviso va en
`--warn-ink` (5,44:1 sobre `--surf`, 4,74:1 sobre `--warn-soft`). Igual que con
el acento, el ámbar tiene una tinta propia para texto y un tono suave para
fondo: no se lee texto pequeño directamente sobre `--warn` ni sobre
`--warn-soft`.

## El estado seleccionado

Un solo patrón para «esto está activo, elegido o encendido», en toda la app:
`.pill-selected` (fondo `--acc-soft`, tinta `--acc-ink`, borde decorativo
`--acc-line`). Lo llevan la pestaña activa de la barra inferior, los filtros de
etiquetas y de dificultad, los dos chips de «cocinado», la cabecera del día de
hoy en el plan y las cabeceras de ubicación de la despensa.

Dos reglas, sin excepción:

- **El color nunca es la única señal.** Además del fondo de `.pill-selected`,
  el elemento lleva texto visible que dice qué es, o `aria-current`/
  `aria-pressed` en el mismo nodo. Quien no distingue colores tiene que
  enterarse igual de qué está seleccionado.
- **Vive dentro del área táctil, sin reducirla.** La píldora es el fondo del
  control completo, no un adorno interior que le roba espacio de toque.

## Iconos

**Dibujados a medida**, no una librería. Es el detalle de openGym que más se nota
sin saber por qué, y lo que separa un producto de una plantilla de Tailwind.
SVG con trazo de 1.8–1.9, `stroke-linecap="round"`, `currentColor` siempre —
nunca un color fijo, o se rompe al cambiar de tema o de acento.

Los cinco de la barra inferior: sol/plato, sartén, calendario, alacena, libro.

## Componentes que hay que resolver bien

- **Selector de raciones**: stepper grande, con las cantidades recalculando en vivo.
- **Fila de kilocalorías**: número grande por ración, total pequeño al lado.
- **Aviso de escalado no lineal**: fondo ámbar tenue, icono e importe en `--warn`.
- **Modo cocina**: pantalla completa, un paso, temporizador pulsable, wake lock.
- **Día del plan**: chips de comida, marca de sobras, presupuesto de tiempo.
- **Fila de despensa**: nombre, cantidad, y días hasta caducar en ámbar si < 7 días (fijo, visual); la alerta de Hoy usa `expiry_alert_days` del hogar.
- **Vacío (`EmptyState`)**: caja hundida sobre `--surf-sunken`, icono a medida
  dentro de un círculo `--acc-soft`/`--acc-ink`, título en `.title-content` y,
  si hace falta, frase y acción. Un solo componente para las ocho pantallas que
  pueden estar vacías; nunca un párrafo gris suelto.
- **Placeholder de receta**: sin foto, degradado `--acc-soft` → `--surf-2` con
  ángulo derivado del id (ocho ángulos fijos, hash determinista — el mismo id
  da el mismo ángulo en servidor y cliente, si no React avisa de un desajuste
  de hidratación) y el icono de recetas encima. Evita que la parrilla sin
  fotos se vea como una rejilla de rectángulos grises idénticos.

## Reglas de tema

- Todo color sale de un token. Ningún literal dentro de un componente.
- `body` pinta fondo explícito desde token.
- El acento se define una vez; los derivados (`--acc-soft`, `--acc-ink`) con
  `color-mix`, no a ojo.
- Respeta `prefers-reduced-motion`: el interruptor es **global** y vive en
  `app/globals.css` (`@media (prefers-reduced-motion: reduce)` anulando
  duraciones y transiciones); ningún componente escribe su propia media query.
- Foco visible en todo lo interactivo.

### Presupuesto de movimiento

**Decisión del usuario (W6.5, ruling W6-R5 — `.superpowers/sdd/2026-08-28-w6-identidad/progress.md`):**
el informe de animaciones original (W6) rechazaba cinco animaciones por
frecuencia de uso o por función — la lista que cerraba esta sección hasta
entonces. El usuario miró la app desplegada y dijo, dos veces, que seguía sin
ver movimiento. Es una decisión de gusto, no un error técnico, y la repitió
tras la primera pasada: su palabra pesa más que la recomendación del informe.
A partir de W6.5 la interfaz anima en todas partes donde el informe antes lo
prohibía, dentro de los mismos presupuestos de duración y con el mismo
interruptor de accesibilidad. Lo que sigue **no puede volver a la política
anterior** sin que el usuario lo pida otra vez.

Cuatro duraciones, ninguna suelta en un componente (Tailwind: `duration-(--dur-N)`):

| Token | Duración | Para qué |
|---|---|---|
| `--dur-1` | 140 ms | Lo que se toca muchas veces (hover, cambio de fila, barra inferior, stepper, checklist) |
| `--dur-2` | 200 ms | Estados que se asientan y salidas (diálogos, entrada de pantalla, hover de tarjeta) |
| `--dur-3` | 500 ms | El anillo de kcal de Hoy |
| `--dur-4` | 300 ms | El asentado más largo: la hoja inferior (bottom sheet) al abrir |

Dos curvas más allá de `--ease-out`/`--ease-in`: `--ease-spring`
(`cubic-bezier(.34, 1.56, .64, 1)`), solo para el pop del icono activo de la
barra inferior — es el único sitio de la app con rebote, a propósito, porque
se toca decenas de veces al día y el rebote es lo que hace que el cambio de
pestaña se note sin llamar la atención el resto del tiempo.

Excepción sancionada: el desplegable de sobras de `finish-dialog.tsx` añade
`delay-75` (75 ms) antes de su `transition-opacity duration-(--dur-2)`, para
que el contenido no empiece a aparecer hasta que el contenedor ha abierto una
fracción — sin el retraso, el texto se ve encajarse dentro de una caja que aún
está creciendo. Es la única duración fuera de la tabla; no sienta precedente
para añadir más sin pasar antes por el informe de animaciones.

**Entrada de pantalla.** Cada una de las cinco pantallas, las páginas de
ajustes y las tarjetas de la puerta de entrada (login, registro, invitación)
llevan `view-enter` (`app/globals.css`, `@utility`): opacidad 0 → 1 y 6 px de
ascenso, disparado por `@starting-style` en cuanto el contenedor se monta —
tanto en la carga inicial como en una navegación de cliente, que desmonta el
contenedor anterior y monta uno nuevo. Sin JavaScript ni estado en React.

**Entrada escalonada del primer pintado.** La parrilla de recetas y las filas
de despensa usan `stagger-in` (mismo fundido/ascenso, pero por `@keyframes`
para poder escalonar con `animation-delay`): cada tarjeta o fila fija
`--stagger-i` por *inline style* con su índice, recortado a 8 antes de llegar
al CSS — pasado eso, el retraso se lee como espera, no como jerarquía. 40 ms
por posición.

**Presión.** `components/ui/button.tsx` lleva `active:scale-[.98]` en la base
compartida por todas las variantes, con `--dur-1`; `recipe-card.tsx` y las
filas/chips que se tocan (fila de despensa, chip de "cocinar" del plan)
heredan el mismo gesto porque están construidos sobre `<Button>` o replican su
transición.

**Barra inferior** (el primer rechazo que W6-R5 levanta): la píldora de la
pestaña activa y el color de la etiqueta transicionan en `--dur-1`; el icono
hace un pop de escala (0.9 → 1, `--ease-spring`, `--dur-2`) **solo** al
volverse activo — no en cada refresco de la pantalla.

**Selector de raciones (stepper) y lista de comprobación de ingredientes**
(el segundo y el tercer rechazo): se toca con prisa, así que el movimiento se
queda en el presupuesto más corto, `--dur-1` (140 ms). El stepper remonta su
número con `key={value}` y lo hace entrar con un fundido de `@starting-style`;
la fila de la checklist transiciona opacidad y color de texto al marcar, nunca
la tachadura (`text-decoration` no interpola de forma útil).

**Propuestas del plan** (el cuarto rechazo): la etiqueta de estado
(aprobada/descartada) que sustituye a los botones «Aprobar»/«Descartar» al
decidir entra con `view-enter` — no hace falta identidad estable de elemento
entre A y B para animar algo, solo un elemento nuevo que fundir.

**Parrilla de recetas** (el quinto rechazo): la entrada escalonada de arriba
vive en `app/(app)/recipes/page.tsx` (el índice), no en `recipe-card.tsx`, que
sigue siendo un Server Component sin estado. En pantallas de escritorio, la
tarjeta además se levanta al pasar el ratón (`hover:-translate-y-0.5
hover:shadow-raised`, `--dur-2`).

**Diálogos y hojas.** Los diálogos suben de 100 ms sueltos a `--dur-2` al
abrir y `--dur-1` (más rápido, a propósito: "simétrico pero algo más rápido al
cerrar") al cerrar. La hoja inferior (bottom sheet) sube su asentado de 200 ms
a `--dur-4` (300 ms, el presupuesto nuevo) con `--ease-out`; su cierre se
queda en `--dur-2`.
