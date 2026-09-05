# Handoff: Rediseño completo de Rezet (app de recetas, plan semanal y despensa)

## 0. Mandato — leer antes de tocar nada

Este no es un handoff de "inspírate en esto". El objetivo es que **la app quede exactamente así**.

- La interfaz actual se **sustituye**, no se adapta. No hay que preservar layouts, estructura de navegación, formularios ni estilos existentes.
- Si un componente actual no puede dar este resultado, **se reescribe el componente**. Si una vista actual no existe en este diseño, **se elimina**. Si el diseño mueve una función a otro sitio, **se mueve**.
- Los valores de este documento (colores, tamaños, radios, tiempos, constantes de muelle) son **literales, no aproximaciones**. No los redondees ni los sustituyas por los de una librería de UI.
- Prohibido resolverlo con una librería de componentes genérica (Material, Bootstrap, Ant, shadcn por defecto) que imponga sus propios radios, sombras y alturas. Los tokens de este documento manda sobre cualquier tema preexistente.
- Cuando haya conflicto entre "lo que ya hace el código" y "lo que dice este documento", **gana este documento**.

### Qué está mal en la app actual y por qué se cambia

1. **Cinco pestañas, una de ellas un modo.** "Cocinar" era un destino de navegación vacío hasta que elegías algo. Ahora es un modo a pantalla completa que se lanza desde la comida o la receta.
2. **"Hoy" era un panel de botones, no una respuesta.** Tres botones sueltos ("Añadir a despensa", "Autorrellenar semana", "Proponer semana") compitiendo con el contenido. Ahora "Hoy" responde una pregunta: qué toca comer y qué hago con ello.
3. **Formulario de receta de 12 campos en un scroll infinito.** Ahora son 3 campos visibles y el resto detrás de un desplegable.
4. **Barra de pestañas opaca que tapaba contenido** (visible en las capturas: la barra cortaba el listado a media altura). Ahora es una capa translúcida con el contenido pasando por debajo y padding inferior reservado.
5. **Cero movimiento y cero feedback al tocar.** Ahora todo responde en `pointer-down` y las hojas se arrastran con física real.
6. **Sin primeros pasos.** Ahora hay guía de 3 pasos, saltable, repetible desde Ajustes.

### Definición de "terminado"

- [ ] 4 pestañas: Hoy · Recetas · Plan · Despensa. Ninguna más.
- [ ] "Cocinar" no aparece en la navegación; se lanza desde una comida de Hoy o desde el detalle de receta.
- [ ] Lista de la compra vive dentro de Plan. Ajustes en la cabecera / pie de la barra lateral.
- [ ] Login con una sola acción principal + atajo a demo.
- [ ] Guía de 3 pasos tras el primer login, con "Saltar" arriba a la derecha.
- [ ] Formulario de nueva receta con 3 campos visibles.
- [ ] Todos los tokens de la sección 3 aplicados, incluido modo oscuro y los 4 acentos.
- [ ] Todos los muelles y curvas de la sección 6 aplicados con las constantes exactas.
- [ ] Barra lateral de 232px a partir de 900px de ancho; barra inferior por debajo.
- [ ] Español e inglés conmutables en caliente sin recargar.
- [ ] Métrico e imperial conmutables.
- [ ] `prefers-reduced-motion` respetado.

---

## 1. Sobre los archivos de este paquete

`RezetApp.dc.html` es una **referencia de diseño escrita en HTML**: un prototipo funcional que muestra el aspecto y el comportamiento previstos. **No es código de producción para copiar y pegar.** La tarea es **recrear este diseño en el entorno real de la app** (React, Vue, Svelte, plantillas de servidor, nativo) usando sus patrones establecidos: su router, su capa de datos, sus convenciones de componentes.

Dos excepciones que **sí** se copian casi literalmente porque no dependen del framework:

- `tokens.css` — el sistema de color completo. Cópialo tal cual y consúmelo con `var(--…)`.
- `motion.js` — el integrador de muelle, la proyección de momento y el rubber-banding. ~60 líneas sin dependencias. Cópialo tal cual o pórtalo 1:1.

**Fidelidad: alta (hi-fi).** Colores, tipografía, espaciado y transiciones son definitivos. Reprodúcelos con precisión de píxel.

Para leer el prototipo: ábrelo en un navegador. La lógica está en el `<script data-dc-script>` al final del archivo; el marcado, en el `<x-dc>`. Los valores que veas en el código tienen prioridad sobre cualquier duda de este README, pero este README los recoge todos.

---

## 2. Arquitectura de navegación

### Pestañas (4, en este orden)

| id | Etiqueta ES | Etiqueta EN | Contenido |
|---|---|---|---|
| `hoy` | Hoy | Today | Día, anillo de calorías, comidas por franja, sugerencias cocinables |
| `recetas` | Recetas | Recipes | Búsqueda, filtros, rejilla de tarjetas |
| `plan` | Plan | Plan | Semana en 7 columnas, cajón de recetas arrastrables, lista de la compra |
| `despensa` | Despensa | Pantry | Inventario agrupado por ubicación con pasos de cantidad |

**Nombres específicos, no genéricos.** "Hoy", no "Inicio". "Despensa", no "Inventario".

### Fuera de las pestañas

- **Cocinar** — pantalla completa (`z-index: 70`), se abre desde: botón "Cocinar" de una comida en Hoy, o botón "Cocinar ahora" del detalle de receta. Al abrirse cierra cualquier vista apilada u hoja.
- **Detalle de receta** y **Nueva receta** — vistas apiladas (`z-index: 60`), entran desde la derecha, se descartan hacia la derecha.
- **Hojas inferiores** (`z-index: 80`): Ajustes, Lista de la compra, Añadir a despensa, Elegir receta, "¿Cómo ha salido?".
- **Arrastre fantasma** `z-index: 95`, **toast** `z-index: 90`, **barra de pestañas** `z-index: 40`.

### Responsive — un solo breakpoint

- **< 900px:** columna única. Barra de pestañas fija abajo, translúcida, con `padding-bottom: calc(8px + env(safe-area-inset-bottom))`. Cada pantalla reserva `padding-bottom: 120px`.
- **>= 900px:** barra lateral de **232px** (`flex: 0 0 232px`), `border-right: 1px solid var(--line)`, `background: var(--bg2)`, `position: sticky; top: 0; height: 100vh`, `padding: 26px 16px`. Logotipo arriba, pestañas, `flex: 1`, Ajustes abajo. La barra inferior no se renderiza.

**Importante:** mide el breakpoint con `matchMedia("(min-width: 900px)")` **en cada render**, no como instantánea al montar, y re-renderiza con un `ResizeObserver` sobre `document.documentElement`. Medirlo una sola vez al montar falla: el contenedor puede crecer después sin disparar `resize`.

Anchos máximos de la columna de contenido (centrada, `margin: 0 auto`):
Hoy `600px` · Recetas `1080px` · Plan `1180px` · Despensa `700px` · Detalle receta `620px` · Nueva receta `560px` · Cocinar `620px` · Hojas `620px`.

---

## 3. Design tokens

Copia este bloque literalmente. Los derivados usan `color-mix`, así que cambiar `--accent` recolorea toda la app sola.

```css
:root{
  --bg: oklch(0.982 0.005 120);
  --bg2: oklch(0.955 0.007 120);
  --surface: #ffffff;
  --surface2: oklch(0.968 0.006 120);
  --text: oklch(0.235 0.012 150);
  --muted: oklch(0.53 0.012 150);
  --line: oklch(0.905 0.008 150);
  --accent: oklch(0.575 0.105 156);
  --warn: oklch(0.60 0.12 68);
  --glass: rgba(255,255,255,.72);
  --shadow-s: 0 1px 2px rgba(30,40,30,.05);
  --shadow-m: 0 1px 2px rgba(30,40,30,.05), 0 8px 24px rgba(25,40,25,.07);
  --shadow-l: 0 2px 6px rgba(20,35,20,.08), 0 24px 60px rgba(20,35,20,.14);
  color-scheme: light;
}
:root[data-theme="dark"]{
  --bg: oklch(0.185 0.008 150);
  --bg2: oklch(0.16 0.008 150);
  --surface: oklch(0.238 0.009 150);
  --surface2: oklch(0.275 0.009 150);
  --text: oklch(0.955 0.006 120);
  --muted: oklch(0.70 0.011 140);
  --line: oklch(0.325 0.010 150);
  --glass: rgba(30,34,30,.68);
  --shadow-s: 0 1px 2px rgba(0,0,0,.28);
  --shadow-m: 0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.34);
  --shadow-l: 0 2px 8px rgba(0,0,0,.36), 0 28px 64px rgba(0,0,0,.5);
  color-scheme: dark;
}
:root{
  --soft:     color-mix(in oklab, var(--accent) 15%, var(--bg));
  --soft2:    color-mix(in oklab, var(--accent) 26%, var(--bg));
  --onaccent: color-mix(in oklab, var(--accent) 8%, white);
  --warnsoft: color-mix(in oklab, var(--warn) 16%, var(--bg));
}
```

### Acentos (los 4 que ofrece Ajustes)

| id | valor |
|---|---|
| `green` (por defecto) | `oklch(0.575 0.105 156)` |
| `amber` | `oklch(0.68 0.125 72)` |
| `coral` | `oklch(0.615 0.135 32)` |
| `blue` | `oklch(0.585 0.105 245)` |

Se aplica con `document.documentElement.style.setProperty("--accent", valor)`. Nada más. No hay una segunda paleta por acento.

### Tema

`system` | `light` | `dark`. `system` escucha `matchMedia("(prefers-color-scheme: dark)")` con listener de `change`. El tema se materializa en `document.documentElement.dataset.theme = "dark" | "light"` — nunca clases en `body`.

### Tipografía

Fuente del sistema, sin webfonts:
```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif
```
Números: `font-variant-numeric: tabular-nums` en **todo** lo que cambia (kcal, cantidades, contadores, temporizador, raciones).
Monoespaciada solo para marcadores de imagen: `ui-monospace, SFMono-Regular, Menlo, monospace`.

**Tracking dependiente del tamaño** — no un valor global:

| Rol | Tamaño | Peso | Tracking | Line-height |
|---|---|---|---|---|
| Título de pantalla | 34px | 700 | −0.03em | 1 |
| Logotipo login | 34px | 700 | −0.028em | 1.05 |
| Título detalle receta | 29px | 700 | −0.03em | 1.1 |
| Título onboarding | 27px | 700 | −0.025em | 1.15 |
| Paso de cocina | 26px | 650 | −0.026em | 1.28 |
| Cifra grande (kcal, total) | 30px | 700 | −0.03em | 1 |
| Temporizador | 38px | 700 | −0.03em | 1 |
| Título de hoja | 20px | 700 | −0.024em | — |
| Título de tarjeta / comida | 16.5px | 600 | −0.018em / −0.015em | 1.25 |
| Botón principal | 16px | 600–650 | −0.01em / −0.015em | — |
| Cuerpo / input | 16px | 400 | −0.01em | 1.5 |
| Fila de lista | 15.5px | 550 | −0.012em | — |
| Secundario | 14.5px | 400 | −0.005em | 1.5 |
| Chip | 14px | 550 | −0.01em | — |
| Meta / nota | 13–13.5px | 400 | — | 1.4–1.5 |
| Eyebrow (mayúsculas) | 13px | 650 | **+0.05em** | — |
| Micro-label de hueco | 11.5px | 650 | **+0.05em** | — |

Los eyebrow y micro-labels van `text-transform: uppercase; color: var(--muted)`. El eyebrow del día en Hoy va en `var(--accent)`.

Párrafos largos: `text-wrap: pretty`.

### Radios

| Uso | Radio |
|---|---|
| Hoja inferior (solo esquinas superiores) | 26px |
| Tarjeta de login | 24px |
| Tarjeta hero / kcal / vacía / detalle | 22px |
| Hero de onboarding | 26px |
| Tarjeta de receta | 20px |
| Contenedor de lista, bloque de despensa | 18px |
| Botón grande, tarjeta de paso, input grande | 16px |
| Hueco del plan | 15px |
| Buscador, textarea, input | 14px |
| Chip botón / botón de cabecera | 12–13px |
| Botón de stepper (dentro de contenedor 11–12px) | 9–10px |
| Casilla de verificación | 7px |
| Píldora, avatar, punto | 99px |

### Alturas de control (nunca por debajo de 44px de área táctil)

Botón principal 52px · CTA de cocina 54px · secundario 48px · buscador 46–50px · cabecera 40–42px · chip 34px (dentro de fila con padding) · item de barra de pestañas `min-height: 52px` · stepper 32–36px dentro de contenedor de 42–44px.

### Espaciado

Padding horizontal de pantalla **20px**. Aire superior de pantalla **34px**. Reserva inferior en móvil **120px**.
Gaps usados: 2, 4, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 34.

### Sombras

Solo tres niveles, y se usan por peso de superficie: `--shadow-s` en tarjetas y filas, `--shadow-m` en botón principal y tarjeta flotante, `--shadow-l` en hojas, fantasma de arrastre y toast. **Nunca** dos superficies translúcidas apiladas.

---

## 4. Pantallas

### 4.1 Login

Fondo: `radial-gradient(120% 90% at 50% -10%, var(--soft) 0%, var(--bg) 62%)`. Contenido centrado, `max-width: 400px`, entra con `rise` 500ms.

- Marca: cuadrado de 64px, `border-radius: 20px`, `background: var(--accent)`, `box-shadow: var(--shadow-m)`, con un icono de cuenco de 30px trazado en `var(--onaccent)`, `stroke-width: 1.9`.
- "Rezet" 34px/700/−0.028em. Debajo, tagline 16px `var(--muted)`, `max-width: 280px`:
  - ES: "Planifica, cocina y controla tu despensa sin esfuerzo."
  - EN: "Plan, cook and keep your pantry straight, effortlessly."
- Tarjeta: `var(--surface)`, borde `1px solid var(--line)`, radio 24px, padding 22px, `--shadow-m`.
  - Botón principal 52px, radio 15px, `var(--accent)` sobre `var(--onaccent)`, con icono de llave 18px + texto "Entrar con passkey" / "Sign in with passkey".
  - Botón secundario 48px, `var(--surface2)`: "Ver la demo" / "See the demo". Entra directo a la app **sin** onboarding.
  - Separador `1px var(--line)`.
  - Nota 13.5px `var(--muted)` centrada: "Solo por invitación. Pídesela a alguien de tu casa." / "Invite only. Ask someone in your household."

"Entrar con passkey" → onboarding paso 0. "Ver la demo" → app directamente.

Sustituye el login antiguo por completo: fuera la tarjeta blanca sobre verde plano y fuera la pantalla separada de "Crear cuenta" (el mensaje de registro cerrado cabe en la nota).

### 4.2 Primeros pasos (onboarding)

Tres pasos. "Saltar" / "Skip" arriba a la derecha, 15px/550 `var(--muted)`, siempre visible.

Hero de 210px, radio 26px, `background: var(--soft)`, borde `1px solid var(--line)`: cuatro barras de 34px de ancho, radio 9px, alturas 64/104/82/52px, opacidades 0.35/0.6/1/0.45 en `var(--accent)`, alineadas abajo con gap 10px. Es un diagrama abstracto, **no** una ilustración: no lo sustituyas por un dibujo.

Copy exacto:

| # | Título ES | Cuerpo ES |
|---|---|---|
| 1 | Tu semana, decidida en un minuto | Arrastra recetas a los huecos del plan. Rezet calcula calorías y la compra por ti. |
| 2 | Tu despensa, siempre al día | Al cocinar se descuenta lo que has usado. Verás al instante qué puedes preparar sin comprar nada. |
| 3 | Cocina sin perder el hilo | Un paso a la vez, con temporizador y la lista de ingredientes delante. |

| # | Título EN | Cuerpo EN |
|---|---|---|
| 1 | Your week, decided in a minute | Drag recipes onto plan slots. Rezet works out calories and the shopping for you. |
| 2 | Your pantry, always current | Cooking subtracts what you used, so you instantly see what needs no shopping. |
| 3 | Cook without losing your place | One step at a time, with a timer and the ingredients right there. |

Tres puntos de 7px en `var(--accent)`. CTA de 52px: "Siguiente" en 1 y 2, "Empezar" en 3. Repetible desde Ajustes → "Ver la guía otra vez".

### 4.3 Hoy

1. **Cabecera.** Eyebrow con la fecha larga localizada (`toLocaleDateString` con `weekday, day, month`) en `var(--accent)`, 13px/600/+0.06em/mayúsculas. Debajo "Hoy" 34px. En móvil, botón de Ajustes de 40px a la derecha (radio 12px, `var(--surface2)`).
2. **Tarjeta de calorías.** `var(--surface)`, radio 22px, padding 20px, `--shadow-s`. A la izquierda un anillo SVG de 92px: `viewBox 0 0 100 100`, `transform: rotate(-90deg)`, dos círculos `r=42`, `stroke-width: 9`; pista en `var(--soft)`, progreso en `var(--accent)` con `stroke-linecap: round`, `stroke-dasharray: 263.9` y `stroke-dashoffset: 263.9 * (1 - pct)`, transición `stroke-dashoffset .7s cubic-bezier(.2,.7,.2,1)`. El porcentaje va centrado dentro, 15px/650. A la derecha: kcal consumidas 30px/700, luego `de {objetivo} kcal · plan {planificado}` en 14.5px `var(--muted)`, y una línea 13.5px/600 en `var(--accent)`: "Te quedan N kcal" o "Objetivo del día completado".
   - **consumidas** = suma de `kcal × raciones` de las comidas **marcadas como cocinadas** hoy. **objetivo** = objetivo diario del hogar (2100 por defecto). **planificado** = suma de todas las comidas de hoy, cocinadas o no. El anillo se satura a 1.
3. **Comidas agrupadas por franja** en el orden `breakfast, lunch, dinner, snack`; las franjas vacías **no se renderizan**. Cabecera de grupo: eyebrow + regla `1px var(--line)` a `flex: 1` + kcal del grupo a la derecha (12.5px, muted). Cada comida: fila `var(--surface)`, radio 18px, padding `14px 14px 14px 16px`, `--shadow-s`; nombre 16.5px/600 con elipsis, meta `4× · 1.234 kcal` en 13.5px muted. A la derecha, **una** de dos cosas:
   - Sin cocinar: botón "Cocinar" de 40px, radio 13px, acento, con icono de cuenco de 15px.
   - Cocinada: píldora `var(--soft)` / `var(--accent)`, 13px/600, con check de 13px y texto "Hecho" / "Done".
   Tocar el nombre abre el detalle de receta con esas raciones.
4. **Vacío.** Tarjeta `1px dashed var(--line)`, radio 22px, padding `36px 24px`, centrada: "Hoy no hay nada planificado" 18px/650 + cuerpo 14.5px muted `max-width: 280px` + botón acento "Planificar la semana" que salta a Plan.
5. **"Puedes cocinarlo ya".** Eyebrow + rejilla `repeat(auto-fill, minmax(200px, 1fr))`, gap 12px. Máximo 3 tarjetas. Solo recetas con **cobertura 100%** de despensa a sus raciones base. Tarjeta: nombre 15.5px/600 + meta `25 min · 610 kcal`.

Elimina los tres botones sueltos de la versión antigua. "Añadir a despensa" vive en Despensa; "Autorrellenar / Proponer semana" desaparece de Hoy (si mantienes la función, va en Plan, no aquí).

### 4.4 Recetas

- Cabecera: "Recetas" 34px + botón acento 42px "Nueva receta" con `+` de 16px.
- Buscador: 46px, radio 14px, `var(--surface)` + borde, `--shadow-s`, lupa de 17px en muted a la izquierda, input sin borde ni outline, y botón de limpiar circular de 24px que aparece solo con texto.
- Fila de chips con scroll horizontal (`scrollbar-width: none`), gap 8px, padding `14px 0 4px`: `Todas` · `Las tengo` · `dieta` · `rápido` · `batch` · `tartera`. Chip activo: fondo `var(--soft)`, texto `var(--accent)`, borde `var(--soft2)`. Inactivo: `var(--surface)` / `var(--text)` / `var(--line)`. "Todas" limpia etiqueta y "Las tengo" a la vez; "Las tengo" es un conmutador independiente.
- Contador de resultados 13.5px muted: `N recetas` / `N recipes`.
- Rejilla `repeat(auto-fill, minmax(240px, 1fr))`, gap 14px. Tarjeta: radio 20px, `overflow: hidden`, `--shadow-s`, `transition: transform .16s cubic-bezier(.2,.7,.2,1), box-shadow .16s ease`; hover sube a `--shadow-m`, activo `scale(.985)`.
  - Cabecera de 104px en `var(--soft)`: inicial de la receta 32px/700 en `var(--accent)` con opacidad 0.5 abajo a la izquierda, y píldora de cobertura `3/4` sobre `var(--surface)` en 12px/600 acento arriba a la derecha.
  - Cuerpo padding 14px: nombre 16.5px/600, descripción 13.5px muted con `height: 38px; overflow: hidden`, y una fila de meta con `tiempo · kcal · dificultad` (13px muted, tabular).
- Búsqueda: coincide con el nombre **o** con cualquier nombre de ingrediente, sin distinguir mayúsculas.
- Vacío: "Sin resultados" 17px/600 + botón "Quitar filtros".

### 4.5 Detalle de receta

Vista apilada. Cabecera translúcida pegajosa (`var(--glass)` + `backdrop-filter: blur(20px) saturate(180%)`, borde inferior `1px var(--line)`, padding `10px 14px`) con botón atrás de 40px y el nombre en 16px/600 con elipsis.

Cuerpo `max-width: 620px`, padding `18px 20px 40px`:

1. Marcador de imagen: 170px, radio 22px, `var(--soft)`, con texto monoespaciado 12px en acento al 0.75: `foto del plato` / `dish photo`. **Sustitúyelo por la foto real cuando exista**; no dibujes nada ahí.
2. Nombre 29px/700, descripción 16px muted, y meta `35 min · Fácil · 2 veces cocinada`.
3. Tarjeta de raciones: radio 20px, padding 16px. Etiqueta "Raciones" + stepper (contenedor `var(--surface2)` radio 12px padding 3px, botones de 36px radio 10px, cifra 17px/650 con `min-width: 34px`). Debajo, kcal por ración 30px/700 + `kcal por ración · N kcal total`. Rango 1–24.
4. **Ingredientes.** Eyebrow + `3/4 tengo` en 13px/600 acento. Contenedor radio 20px, filas con `border-bottom: 1px solid var(--line)`, padding `13px 15px`. Cada fila: punto de 8px (`var(--accent)` si hay suficiente, `var(--warn)` si no), nombre 15.5px/550, nota 12.5px muted, cantidad 15px/600 tabular a la derecha.
   - Nota: `tengo 1 kg` si hay de sobra · `220 g de menos` si falta · `no está en la despensa` si no existe. EN: `have …` / `… short` / `not in the pantry`.
   - Los ingredientes sensibles llevan la fila con fondo `var(--warnsoft)`.
   - Si hay alguno sensible, aviso al pie: caja `var(--warnsoft)` / `var(--warn)`, radio 14px, 13px: "La sal y las especias no se duplican al subir raciones: se ajustan poco a poco."
5. **Pasos.** Tarjetas radio 16px con número en círculo de 24px (`var(--soft)` / `var(--accent)`, 12.5px/700) y texto 15.5px/lh 1.5. Si el paso tiene minutos, línea 12.5px/600 acento con `N min`.
6. Acciones: "Cocinar ahora" (acento, 52px, radio 16px, `--shadow-m`, `flex: 1 1 180px`) y "Añadir al plan" (`var(--surface2)`, `flex: 1 1 140px`). "Añadir al plan" abre la hoja de elección con los 14 huecos (7 días × comida/cena) de la semana visible.

### 4.6 Nueva receta

**Tres campos visibles. Nada más.** El resto va detrás de "Más detalles".

Cabecera pegajosa translúcida: "Cancelar" a la izquierda, "Nueva receta" centrado, "Guardar" a la derecha. **"Guardar" está apagado** (`var(--surface2)` / `var(--muted)`) mientras el nombre esté vacío, y pasa a acento cuando hay nombre. Al pulsarlo sin nombre: toast "Ponle un nombre a la receta".

1. Nombre: input **sin caja**, 27px/700/−0.03em, placeholder "Nombre de la receta". Debajo, regla de 1px.
2. Descripción: input sin caja, 16px, placeholder "Una línea que la describa".
3. Ingredientes: eyebrow + `textarea` de 6 filas, radio 16px, `line-height: 1.7`, placeholder `300 g lentejas ⏎ 1 cebolla ⏎ 2 g sal`. Debajo, contador vivo 13px muted: `N ingredientes reconocidos`, o la ayuda "Uno por línea: cantidad, unidad y nombre." cuando está vacío.
4. Pasos: `textarea` de 6 filas, placeholder "Un paso por línea. / Sofríe la cebolla 5 min."
5. **"Más detalles"** — bloque colapsable radio 18px con `+` / `–` a la derecha. Dentro: raciones base (stepper), Minutos y kcal/ración (dos inputs de 44px lado a lado), dificultad (3 chips: Fácil/Media/Difícil) y etiquetas (chips múltiples).

**Parsing de ingredientes** (una línea = un ingrediente):
```
/^([\d.,]+)\s*(g|kg|ml|l|ud|uds|pcs)?\s+(.*)$/i
```
`kg → g ×1000`, `l → ml ×1000`, `uds|pcs → ud`, unidad ausente → `ud`. Si no hay coincidencia: cantidad 1, unidad `ud`, todo el texto como nombre.
**Detección de ingrediente sensible** (no escala linealmente):
```
/sal|salt|especia|spice|pimienta|pepper|levadura|yeast|curry/i
```
**Parsing de pasos:** separa por líneas en blanco o saltos; si el texto contiene `N min|minutos|minutes`, ese paso obtiene temporizador de N minutos.

Valores por defecto al guardar: minutos 20, kcal 450, dificultad `easy`, raciones 2.

### 4.7 Plan

- Cabecera: "Plan" 34px + rango de la semana localizado (`4 de septiembre – 10 de septiembre`) en 14.5px muted. A la derecha: `‹` 40px, "Esta semana" (40px, `var(--surface2)`), `›` 40px, y botón acento "Lista de la compra" con icono de bolsa.
- **Cajón de recetas arrastrables**: tarjeta radio 18px, padding `12px 14px`. Eyebrow "Arrastra una receta a un hueco". Fila con scroll horizontal de píldoras de 36px en `var(--soft)` / `var(--accent)`, 14px/600, `cursor: grab`, `touch-action: none`, `user-select: none`. Máximo 8 recetas.
- **Semana**: `display: grid; grid-auto-flow: column; grid-auto-columns: minmax(168px, 1fr); gap: 10px; overflow-x: auto`. Esto da 7 columnas en escritorio y scroll horizontal en móvil sin media queries. Semana **de lunes a domingo**.
  - Cabecera de día: `vie 4` 15px/650 + kcal abreviadas (`3.8k`) 12.5px muted. Si es hoy, punto de 7px en acento a la derecha.
  - Cuatro huecos por día en el orden fijo desayuno/comida/cena/snack. Hueco: `var(--surface)`, radio 15px, borde 1px, `min-height: 66px`, padding 9px, `--shadow-s`, y **`data-slot="{fechaISO}|{franja}"`** — ese atributo es lo que usa el arrastre para saber dónde suelta.
    - Micro-label de franja + botón `+` de 22px (radio 7px) que abre la hoja de elección.
    - Comidas: bloque `var(--soft)` radio 11px, nombre 13.5px/600 con elipsis, meta `4× · Hecho`, y `×` de 20px para quitar.
    - **Resaltado de destino durante el arrastre:** div absoluto `inset: -2px`, radio 17px, `border: 2px solid var(--accent)`, fondo `var(--soft)`, opacidad 0.55, `pointer-events: none`.

### 4.8 Despensa

- Cabecera: "Despensa" + botón acento "Añadir".
- Buscador idéntico al de Recetas.
- Agrupada por ubicación en este orden: **Armario · Nevera · Congelador**. Los grupos vacíos no se renderizan. Cabecera de grupo: eyebrow + regla + recuento.
- Contenedor radio 18px con filas de padding `13px 14px` separadas por `1px var(--line)`: nombre 15.5px/550; subtítulo 12.5px con "caduca en N días" o "sin fecha" — y en **`var(--warn)`** cuando faltan 3 días o menos, en `var(--muted)` si no.
- Stepper de cantidad: contenedor `var(--surface2)` radio 11px, botones de 32px, cifra `min-width: 64px` tabular. **Paso: 1 para unidades, 100 para g/ml.** Nunca baja de 0; al llegar a 0 el ítem se elimina de la lista.
- Botón de borrar de 32px, muted, que pasa a `var(--warn)` en hover.
- Vacío: tarjeta discontinua con "La despensa está vacía" + "Añade lo que tengas en casa y Rezet te dirá qué puedes cocinar." + botón "Añadir".

Hoja **Añadir a despensa**: input de nombre 50px; fila con cantidad (`flex: 2`) y tres chips de unidad `g` / `ml` / `uds` (`flex: 3`); tres chips de ubicación; botón acento "Añadir" de 52px. Al guardar en Nevera, `exp = 5` días por defecto; en Armario, sin fecha.

### 4.9 Cocinar (pantalla completa)

- **Cabecera:** cerrar (`×`, 40px), nombre 16px/650 + `Paso 2/3` 12.5px muted, y stepper de raciones a la derecha (32px). Cambiar raciones **recalcula las cantidades en vivo**.
- **Barra de progreso:** 3px de alto, pista `var(--line)`, relleno `var(--accent)` con `width: ((paso+1)/total)×100%` y `transition: width .45s cubic-bezier(.2,.7,.2,1)`.
- **Paso actual:** 26px/650/−0.026em/lh 1.28. Es el elemento más grande de la pantalla: se lee a un metro de distancia, con las manos ocupadas.
- **Temporizador** (solo si el paso tiene minutos): tarjeta radio 20px con `mm:ss` en 38px/700 tabular, botón acento "Empezar"/"Pausa" de 46px y "Reiniciar" en `var(--surface2)`. Cuenta atrás de 1s. Al llegar a 0: se detiene y vibra `[40, 60, 40]`.
- **Ingredientes con casilla:** filas de 14px con casilla de 22px radio 7px (`border: 2px solid`; marcada → borde y fondo `var(--accent)` con check blanco de 12px y `stroke-width: 3.4`). Al marcar, el texto pasa a `var(--muted)` con `line-through`. Los sensibles llevan fondo `var(--warnsoft)`.
- **Barra inferior translúcida:** botón atrás de 56×54px (opacidad 0.4 en el primer paso) y CTA de 54px que dice "Siguiente" y en el último paso **"He terminado"**.
- **"He terminado"** abre la hoja **"¿Cómo ha salido?"**: raciones realmente hechas (stepper), aviso en `var(--warnsoft)` listando lo que faltaba ("No tenías todo: Cebolla · 220 g"), y botón "Guardar".
- **Al guardar:** resta de la despensa las cantidades escaladas de cada ingrediente que exista en ella (nunca por debajo de 0; los que quedan a 0 se eliminan), incrementa el contador de veces cocinada, marca la comida del plan como cocinada con esas raciones —o crea una entrada en hoy (comida si es antes de las 16h, cena si no) si se cocinó sin plan—, cierra el modo, vibra `[18, 40, 26]` y muestra el toast "Cocinado. Despensa actualizada."

### 4.10 Ajustes (hoja inferior)

Cuatro bloques con eyebrow:
1. **Aspecto** — 3 chips de tema (Sistema/Claro/Oscuro) + fila de 4 círculos de acento de 38px con `border: 2px solid var(--text)` en el activo y `transparent` en el resto.
2. **Idioma** — 2 chips: Español / English. Conmuta en caliente.
3. **Unidades** — 2 chips: Métrico / Imperial.
4. Acciones de 48px alineadas a la izquierda: "Ver la guía otra vez" (`var(--surface2)`) y "Cerrar sesión" (`var(--warnsoft)` / `var(--warn)`).

Fuera: pestañas de "Household / Members / AI / ShopList / API tokens" apiladas en una fila con scroll y el bloque "Eliminar hogar" al fondo. Si esas opciones deben seguir existiendo, van en una vista propia de Ajustes avanzados, **un nivel más abajo**, no en la primera pantalla.

---

## 5. Reglas de negocio (impleméntalas exactamente)

### 5.1 Escalado de ingredientes

```
factor = raciones / raciones_base
cantidad = sensible ? base_q * factor^0.55
                    : base_q * factor
```
El exponente 0.55 es deliberado: doblar la sal arruina el plato. Aplícalo en detalle de receta, modo cocinar, lista de la compra y descuento de despensa — **el mismo cálculo en los cuatro sitios**.

### 5.2 Cobertura de despensa

Un ingrediente está cubierto si existe un ítem de despensa con el **mismo nombre normalizado a minúsculas** y `cantidad_despensa >= necesidad * 0.999` (la tolerancia evita falsos negativos por coma flotante). Cobertura de receta = `cubiertos / total`. "Puedes cocinarlo ya" exige cobertura 1.

En producción esto debería casar por **id de ingrediente**, no por nombre. Si tu modelo ya tiene ids canónicos, úsalos; el prototipo casa por nombre solo porque no tiene backend.

### 5.3 Lista de la compra

Recorre los **7 días de la semana visible**, todas las franjas, e ignora las comidas ya cocinadas. Acumula por clave `nombre|unidad` la necesidad escalada. Resta lo que haya en despensa. Conserva solo los huecos `> 0.5`. Agrupa en **Fresco · Seco · Conserva** (el grupo viene del ingrediente). Cada línea tiene casilla persistente. "Pasar lo marcado a la despensa" suma las cantidades marcadas al inventario (creando el ítem si no existe: Nevera + 5 días de caducidad si es fresco, Armario sin fecha si no), limpia las marcas y cierra la hoja con el toast "Pasado a la despensa".

### 5.4 Unidades

Imperial: `g → oz` dividiendo por **28.35**, `ml → fl oz` por **29.57**. `ud` se muestra como "uds" (ES) / "pcs" (EN) y **no se convierte**. Redondeo: un decimal, y sin decimal si el resto es menor que 0.05. Formato de miles según idioma (`es-ES` / `en-US`).

### 5.5 Estado

| Clave | Tipo | Notas |
|---|---|---|
| `lang` | `"es" \| "en"` | persiste |
| `theme` | `"system" \| "light" \| "dark"` | persiste |
| `accent` | `"green" \| "amber" \| "coral" \| "blue"` | persiste |
| `units` | `"metric" \| "imperial"` | persiste |
| `authed`, `onboard` | bool, `0..2 \| null` | **no** persisten: cada carga empieza en login |
| `tab` | id de pestaña | |
| `push` | `{type:"recipe"\|"new"} \| null` | vista apilada |
| `sheet` | `"settings"\|"shop"\|"pantryAdd"\|"picker"\|"finish" \| null` | una sola a la vez |
| `sheetY` | número | desplazamiento de arrastre de la hoja |
| `cookState` | `{id, serv, step, checked, remaining, running, ref}` | `ref` = `{key, slot, uid}` de la comida del plan, o `null` |
| `drag` | `{id, x, y, over}` | `over` = valor de `data-slot` bajo el puntero |
| `query`, `tag`, `haveOnly`, `pantryQuery`, `weekOffset` | filtros y navegación temporal | |
| `recipes`, `pantry`, `plan`, `shopChecked`, `target` | datos | persisten |
| `toast` | string \| null | se limpia a los **2200ms** |

En la app real, `recipes`/`pantry`/`plan` vienen del servidor; el resto es estado de UI.

### 5.6 Datos que el backend tiene que exponer

Sin esto, ni el descuento automático ni la lista de la compra funcionan:

- **Ingrediente de receta:** cantidad, unidad, grupo (`fresco`/`seco`/`conserva`), marca de sensible y (idealmente) id canónico de alimento.
- **Receta:** raciones base, minutos, dificultad, kcal por ración, etiquetas, veces cocinada.
- **Ítem de despensa:** cantidad, unidad, ubicación (`cupboard`/`fridge`/`freezer`), días hasta caducar.
- **Entrada de plan:** fecha, franja, id de receta, raciones, marca de cocinada.
- **Hogar:** objetivo de kcal diarias.

---

## 6. Movimiento

Base tomada de *Designing Fluid Interfaces* (WWDC 2018). Tres reglas por encima de los números: el feedback ocurre en `pointer-down`, el arrastre sigue al dedo 1:1, y **cualquier animación se puede agarrar y revertir a mitad de vuelo**.

### 6.1 Presión

Todo elemento pulsable baja de escala en `:active` con `transition: transform .12s ease-out`:
botones grandes `.98` · botones medianos `.96` · botones pequeños/steppers `.9–.94` · tarjetas `.985`.
**Nunca** esperes al `click`/`pointerup` para mostrar feedback.

### 6.2 Keyframes

```css
@keyframes fadein  { from{opacity:0} to{opacity:1} }
@keyframes rise    { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }
@keyframes pushin  { from{opacity:.4;transform:translateX(26px)} to{opacity:1;transform:none} }
@keyframes toastin { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }
```

| Elemento | Animación |
|---|---|
| Vista apilada (detalle, nueva receta) | `pushin .3s cubic-bezier(.2,.7,.2,1)` |
| Hoja inferior | `rise .34s cubic-bezier(.2,.75,.2,1)` |
| Scrim de la hoja | `fadein .22s` |
| Cambio de pestaña | `fadein .28s` |
| Login / onboarding | `rise .5s` / `fadein .3s` |
| Toast | `toastin .28s`, visible 2200ms |
| Anillo de kcal | `stroke-dashoffset .7s cubic-bezier(.2,.7,.2,1)` |
| Progreso de cocina | `width .45s cubic-bezier(.2,.7,.2,1)` |
| Fondo de pestaña activa | `background .18s ease` |

### 6.3 Muelle (para todo lo que el usuario toca)

Integrador por frame, `requestAnimationFrame`, **constantes exactas**: rigidez `k = 190`, amortiguación `c = 27` (críticamente amortiguado, sin rebote). `dt` limitado a 32ms. Se detiene cuando `|x − destino| < 0.6` y `|v| < 14`.

```js
step(now) {
  const dt = Math.min(0.032, (now - last) / 1000); last = now;
  v += (-k * (x - to) - c * v) * dt;
  x += v * dt;
}
```

Se usa para: retorno y cierre de la hoja arrastrada. **Se anima siempre desde el valor actual en pantalla y con la velocidad de salida del dedo** — nunca desde el valor lógico, y nunca reiniciando la velocidad a 0.

Añade rebote (`c` más bajo, ~0.8 de ratio) **solo** cuando el gesto llevaba impulso. En esta app no hay ningún caso: todo es críticamente amortiguado.

### 6.4 Arrastre de la hoja inferior

1. `pointerdown` en el asa (40×5px, radio 99px, `var(--line)`): cancela cualquier `requestAnimationFrame` en vuelo y guarda `startY`.
2. `pointermove`: `dy = clientY − startY`. Si `dy < 0` (hacia arriba), **rubber-banding**: `dy × 0.25`. Se aplica como `translateY`. Seguimiento 1:1.
3. Velocidad: derivada de los dos últimos eventos con `dt` mínimo de 8ms, en px/s.
4. `pointerup`: **proyección de momento** de Apple, no la distancia recorrida:
   ```js
   const projected = y + (vel / 1000) * 0.998 / (1 - 0.998);
   ```
   Si `projected > 140` → muelle hasta `620` y cierra al terminar. Si no → muelle de vuelta a `0`. En ambos casos se pasa la velocidad de salida como velocidad inicial del muelle.

Toque en el scrim: cierra igual.

### 6.5 Arrastre de receta al plan

`pointerdown` en la píldora (con `preventDefault`) inicia el arrastre; los listeners van en `window`, no en el elemento, para no perder el gesto al salir de sus límites. En cada `pointermove`: `document.elementFromPoint(x, y)` + `closest("[data-slot]")` determina el destino, y el hueco se resalta al instante. El fantasma es una píldora de 38px con `--shadow-l` y `scale(1.04)`, posicionada con `translate3d(x−40, y−24, 0)` y **`pointer-events: none`** (sin esto, `elementFromPoint` devuelve el fantasma y nada funciona). Al soltar sobre un hueco: añade al plan, vibra 12ms, toast "Añadido al plan".

### 6.6 Materiales

Barras de navegación, cabeceras pegajosas y la barra inferior de Cocinar:
```css
background: var(--glass);
backdrop-filter: blur(22px) saturate(180%);
-webkit-backdrop-filter: blur(22px) saturate(180%);
border-top: 1px solid var(--line);   /* o border-bottom en cabeceras */
```
El contenido **pasa por debajo**; no reserves una franja opaca. Las cabeceras pegajosas usan `blur(20px)`.
Superficies grandes → más blur y sombra más profunda que los chips. **Nunca** apiles una superficie translúcida sobre otra.
Las hojas modales van con scrim `rgba(8,12,8,.42)`. Los paneles no bloqueantes, sin scrim.

### 6.7 Haptics

Solo tres momentos (`navigator.vibrate`, si existe):
`12` al añadir al plan · `[40,60,40]` al acabar el temporizador · `[18,40,26]` al guardar un cocinado.
Nada más. Vibrar en cada toque entrena al usuario a ignorarlo.

### 6.8 Movimiento reducido

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .12s !important }
}
```
Además: sustituye los muelles por transiciones cortas de opacidad y **mantén** el feedback de color y estado. Movimiento reducido no significa sin feedback.

---

## 7. Copy — claves de i18n

El prototipo lleva los dos diccionarios completos en el objeto `L` de la clase (`L.es` y `L.en`). Extráelos de ahí; están alineados clave a clave. Reglas:

- El texto que ves en el prototipo es el definitivo. **No lo reescribas** al implementar.
- Los nombres de las 8 recetas y de los 13 ítems de despensa son datos de demo bilingües (`{es, en}`); en producción son datos del usuario y no se traducen.
- Fechas y números siempre con `toLocaleDateString` / `toLocaleString` y locale `es-ES` o `en-US` según el idioma activo.
- El cambio de idioma es inmediato, sin recarga.

Toasts (2200ms): "Añadido al plan" · "Quitado del plan" · "Receta guardada" · "Añadido a la despensa" · "Cocinado. Despensa actualizada." · "Pasado a la despensa" · "Ponle un nombre a la receta".

---

## 8. Accesibilidad y detalles de oficio

- Área táctil mínima 44px. Los steppers de 32–36px van dentro de contenedores de 42–44px con padding.
- `tabular-nums` en toda cifra que cambie, para que no baile.
- Foco visible: los inputs de este diseño quitan el `outline` por defecto; **añade un anillo de foco propio** con `var(--accent)` al implementar (el prototipo no lo tiene y es una carencia real).
- Etiqueta cada control de icono suelto con `aria-label` (atrás, cerrar, ajustes, borrar, sumar, restar).
- Las casillas de ingredientes y de la compra son `<button>` en el prototipo: en producción deben ser `role="checkbox"` con `aria-checked`, o `<input type="checkbox">` con etiqueta.
- La barra de progreso de cocina necesita `role="progressbar"` con `aria-valuenow`.
- Las hojas inferiores son diálogos modales: atrapa el foco, cierra con `Escape`, devuelve el foco al disparador.
- Anuncia los toasts en una región `aria-live="polite"`.
- Ancla la hoja/popover a su origen (`transform-origin` en el disparador) cuando el elemento venga de un botón concreto.

---

## 9. Assets

**Ninguno.** Sin webfonts (fuente del sistema), sin imágenes, sin librería de iconos.

- Los iconos son SVG en línea de trazo, 4 en la navegación y ~20 en la interfaz, `stroke-width` entre 1.8 y 2.6, `stroke-linecap: round`, `currentColor`. Están todos en el prototipo; cópialos o sustitúyelos por los equivalentes de tu set de iconos manteniendo el grosor.
- Los sitios donde deben ir **fotos reales** están marcados con un marcador monoespaciado (`foto del plato`) y la inicial de la receta en las tarjetas. Sustitúyelos por fotos cuando existan; **no** los rellenes con ilustraciones generadas ni con SVG decorativo.

---

## 10. Archivos de este paquete

| Archivo | Qué es |
|---|---|
| `RezetApp.dc.html` | Prototipo completo y funcional. Referencia de diseño y de comportamiento. Ábrelo en el navegador y úsalo como fuente de verdad ante cualquier duda. |
| `tokens.css` | Sistema de color completo, listo para copiar tal cual. |
| `motion.js` | Muelle, proyección de momento y rubber-banding. Sin dependencias. Copiable tal cual. |
| `README.md` | Este documento. |

## 11. Orden de implementación sugerido

1. `tokens.css` + tema (`data-theme`) + acento. Verifica claro/oscuro/sistema y los 4 acentos antes de seguir.
2. Escala tipográfica y primitivas: botón, chip, fila de lista, tarjeta, stepper, casilla, eyebrow.
3. Shell: barra lateral ≥900px / barra inferior translúcida, con la medición por `matchMedia` + `ResizeObserver` de la sección 2.
4. `motion.js` + la hoja inferior arrastrable. Es la pieza que da el carácter a toda la app; hazla pronto.
5. Reglas de negocio de la sección 5 (escalado, cobertura, compra, unidades) con tests. Son la base de tres pantallas.
6. Pantallas en este orden: Hoy → Recetas → Detalle → Cocinar → Plan → Despensa → Nueva receta → Login → Onboarding → Ajustes.
7. i18n y unidades al final, verificando que ninguna cadena quedó incrustada.
8. Repasa la lista de "Definición de terminado" de la sección 0, en móvil (390px) y en escritorio.
