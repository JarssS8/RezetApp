# 03 · Reglas de dominio

Todo lo de este documento vive en `lib/domain/`, sin dependencias de React, Next
ni HTTP. Es lo que consumen por igual la interfaz, la API REST y el MCP.
**Cada función de aquí lleva test.**

## 1. Escalado de cantidades

La funcionalidad diferencial del producto. Ninguno de los 28 proyectos revisados
la hace.

Cada ingrediente de una receta lleva `scales_linearly: boolean`.

```ts
const DAMP = 0.55

export function escalar(cantidad: number, ratio: number, lineal: boolean) {
  return lineal ? cantidad * ratio : cantidad * Math.pow(ratio, DAMP)
}
```

**No escalan linealmente** (por defecto `false` al importar, revisable a mano):
sal, especias y hierbas secas, levadura química y de panadería, alcohol para
desglasar, gelatina, bicarbonato, extractos y esencias.

**Además, no escalan en absoluto** y deben avisarse en la interfaz:
- tiempos de cocción y horneado
- tamaño de molde o cazuela
- temperatura del horno

La interfaz marca los ingredientes no lineales en `--warn` con un icono, y
muestra una nota explicando el porqué. **No lo escondas**: el aviso es la mitad
del valor de la funcionalidad.

### Presentación de cantidades

- Unidades de masa y volumen (`g`, `ml`): sin decimales, redondeo al entero.
- Cantidades ≥ 10: entero.
- Cantidades < 10: fracciones bonitas cuando estén a menos de 0,05 — `¼ ⅓ ½ ⅔ ¾`.
  Si no, un decimal con coma (español).
- Nunca muestres `1.5 cdta`; muestra `1 ½ cdta`.

## 2. Kilocalorías: siempre por ración

**El valor por ración no cambia al escalar.** Si haces la misma receta para seis
en vez de cuatro, cada plato lleva lo mismo: usas más ingredientes pero repartes
en más platos. Lo que cambia es el total.

```
4 raciones → 412 kcal/ración · 1 648 total
6 raciones → 412 kcal/ración · 2 472 total
```

En la interfaz: número grande por ración, total pequeño al lado.
**Nunca muestres "412 kcal" sin decir de qué.**

Matiz: con el escalado no lineal las especias varían, así que las kcal por ración
cambian una fracción. Es despreciable y el redondeo al entero lo tapa. Si algún
día se marca el aceite o el azúcar como no lineales, ahí sí habría que recalcular
de verdad — dejar un comentario en el código para ese caso.

Se guarda y se muestra también **por 100 g**: la primera vista sirve para comer,
la segunda para comparar.

## 3. Unidades

- Se **guarda siempre en unidad base**: `g`, `ml`, `ud`. La conversión es en la capa
  de presentación.
- Métrico e imperial es preferencia de usuario.
- **Las tazas son por alimento**, no globales: una taza de harina son ~120 g y una
  de azúcar ~200 g. Hace falta una tabla `food_id → g por taza / cucharada`.
  Si no hay dato, muestra la unidad original sin convertir en vez de inventar.

## 4. Base de datos de alimentos y nutrición

**Esta es la parte que más va a doler.** Contar calorías es trivial; saber qué son
150 g de "cebolla" no lo es.

Orden de resolución, en cascada:

1. **Open Food Facts** — excelente con productos envasados y códigos de barras,
   floja con ingredientes crudos. Gratis y abierta.
2. **USDA FoodData Central** — cubre los crudos. Gratis, pero nombres en inglés y
   una taxonomía que no se parece a cómo escribe la gente. Sembrar en local al
   instalar.
3. **Coincidencia difusa** contra lo ya resuelto en esta instancia.
4. **Estimación por IA**, y solo entonces — con etiqueta `estimado` **visible y
   editable**. Sin esa etiqueta todo el módulo de nutrición se vuelve mentira.

La corrección manual del usuario se guarda para siempre y gana a todo lo demás.

## 5. Parser de ingredientes

Convertir `2 dientes de ajo picados finos` en cantidad + unidad + alimento +
preparación. Parece fácil dos semanas y luego no lo es. En español añade géneros,
plurales y unidades vagas: "un chorrito", "al gusto", "una pizca".

Estrategia: **reglas y expresiones regulares para el 80 %**, IA solo para lo que
falle, y una interfaz donde corregir un parseo malo cueste dos clics.
Una corrección manual barata vale más que un parser perfecto.

## 6. Despensa

- Cantidades en unidad base, con `location`: `fridge | freezer | pantry`.
- `expires_at` opcional. Alerta configurable, por defecto a 3 días.
- **Descuento automático**: `log_cooked` resta los ingredientes de la receta,
  escalados a las raciones realmente cocinadas. Operación atómica junto con el
  registro nutricional. El descuento saca primero de lo que antes caduca (FIFO
  por `expires_at`, nulos al final, luego `added_at`) y se aplica con
  `GREATEST(0, quantity − x)` atómico por fila; el aviso sale de lo realmente
  descontado.
- Si al descontar queda negativo, deja en 0 y registra un aviso — no falles.

## 7. Consolidación para la compra

Cuando se genera lo que hay que comprar (que luego se envía a ShopList):

1. Recorrer las comidas planificadas del rango.
2. Escalar cada receta a las raciones de su hueco.
3. Agrupar por `food_id`, sumando en unidad base.
4. **Restar lo que hay en despensa.**
5. Descartar lo que quede en ≤ 0.
6. Convertir a formato de envío (ver `docs/06-SHOPLIST.md`).

Se excluyen las entradas ya cocinadas o saltadas (además de las sobras). Líneas
sin `food_id` se agrupan por nombre y no restan despensa; líneas sin unidad base
salen con cantidad vacía.

Los pasos 3 y 4 son la razón por la que esto se calcula aquí y no en ShopList.

## 8. Sobras

Una comida cocinada puede producir raciones sobrantes que se colocan en otro hueco
del plan. Esas raciones **no vuelven a generar compra** — ya se compraron.
Modelarlas como una entrada de plan que referencia la comida original, no como una
receta nueva.
