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
| Títulos | **Outfit** 600/700 | Cabeceras de pantalla, nombres de receta |
| Interfaz | **DM Sans** 400/500/600/700 | Todo el texto corriente |
| Datos | **JetBrains Mono** 500/600 | Cantidades, kcal, fechas, etiquetas |

Los números que se comparan en columna llevan `font-variant-numeric: tabular-nums`.
El texto corrido no pasa de ~65 caracteres de ancho.

## Escala de radios

```
--r-lg: 22px   tarjetas y hero
--r-md: 16px   tarjetas internas, campos, tiendas
--r-sm: 12px   botones, chips cuadrados, steppers
píldoras: 20px o 999px
```

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

`--on-acc` es el color del texto sobre el acento: blanco en claro, verde muy
oscuro en Noche suave. Nunca escribas un color de contraste a mano.

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
- **Fila de despensa**: nombre, cantidad, y días hasta caducar en ámbar si <7.

## Reglas de tema

- Todo color sale de un token. Ningún literal dentro de un componente.
- `body` pinta fondo explícito desde token.
- El acento se define una vez; los derivados (`--acc-soft`, `--acc-ink`) con
  `color-mix`, no a ojo.
- Respeta `prefers-reduced-motion`.
- Foco visible en todo lo interactivo.
