# Seed de datos

## `foods.json` — alimentos base (USDA)

### Origen y licencia

Los datos nutricionales vienen de **USDA FoodData Central**, tipos **Foundation** y
**SR Legacy** (los tipos `Branded`/`Survey` no se usan porque son comerciales o
compuestos, no ingredientes base). Es información de dominio público del gobierno
de EE. UU.; no requiere atribución legal, pero se cita aquí por transparencia:

- Foundation Foods: <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip>
  (descargado 2026-08-26, versión del dataset 2026-04-30)
- SR Legacy: <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip>
  (descargado 2026-08-26, versión del dataset 2018-04; USDA no la actualiza más)
- Página de descargas (para futuras versiones): <https://fdc.nal.usda.gov/download-datasets>

Cuando se use **Open Food Facts** (licencia ODbL) para productos envasados con
código de barras, la atribución correspondiente se documentará en W2, cuando se
implemente esa fuente (`source = 'off'`).

### Cómo descargar y regenerar

```bash
mkdir -p data/usda
curl -L -o data/usda/foundation.zip "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip"
curl -L -o data/usda/sr_legacy.zip "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
cd data/usda && python3 -c "import zipfile; [zipfile.ZipFile(z).extractall('.') for z in ['foundation.zip','sr_legacy.zip']]" && rm -f foundation.zip sr_legacy.zip
cd ../..
pnpm tsx scripts/build-foods-seed.ts --input ./data/usda
```

`data/` está en `.gitignore`: los dumps de USDA nunca se commitean, solo el
`foods.json` resultante (573 alimentos, muy por debajo de 1 MB).

`build-foods-seed.ts` es determinista: con los mismos dumps, `foods-keywords.json`
y `foods-translations.json`, siempre regenera el mismo `foods.json` byte a byte
(se ha verificado corriéndolo dos veces seguidas).

### Criterio de selección

Se conservan los alimentos cuya `description` (en minúsculas) **empieza** por
alguna palabra clave de `foods-keywords.json`, con **límite de palabra**
(`"butter"` no engancha `"Butterbur"` ni `"Buttermilk"`, `"beer"` no engancha
`"Beerwurst"`) y sin ninguna de las exclusiones, también por palabra completa
(`baby food`, `fast foods`, `restaurant`, `infant`, `formula`, `snacks`,
`candies`, `school lunch`, `usda commodity`, …). Una lista corta de
`FORCE_INCLUDE` en `build-foods-seed.ts` rescata casos concretos que una
exclusión por palabra completa seguiría descartando con razón (el único
`ketchup` de USDA es literalmente "Ketchup, **restaurant**").

Cuando varias descripciones matchean la misma palabra clave se descartan antes
los duplicados exactos de `description` (USDA a veces repite el mismo
alimento con `fdcId` distinto, p. ej. "Egg, white, raw, frozen, pasteurized"
aparece igual en Foundation y en SR Legacy), y se prioriza, en este orden:
**crudo** (`raw`, por palabra completa) → **con energía conocida** (evita que
un registro incompleto de Foundation gane a un homólogo de SR Legacy con
kcal real: ver "Energía" más abajo) → **Foundation** sobre **SR Legacy** → el
orden de aparición en las descargas. Máximo 3 alimentos por palabra clave.

Al ser una coincidencia de **prefijo** (no un buscador), hay efectos
conocidos y aceptados:

- De las 297 palabras clave, 270 tuvieron al menos una coincidencia; 27 no
  encontraron nada porque USDA nombra el alimento de otra forma (p. ej.
  `zucchini` está en USDA como "Squash, summer, zucchini…", no como
  "Zucchini…"): `scallions`, `zucchini`, `green beans`, `coconut`, `rabbit`,
  `chorizo`, `surimi`, `tahini`, `salsa`, `pesto`, `broth, chicken`,
  `broth, beef`, `broth, vegetable`, `stock`, `spices, mint`, `cilantro`,
  `mint, fresh`, `chocolate chips`, `wine, table, red`, `wine, table, white`,
  `beer`, `coffee, brewed`, `tea, brewed`, `water, tap`,
  `beverages, soy milk`, `beverages, oat milk`, `coconut milk`. No es un
  fallo: es el límite de un criterio por prefijo (la mayoría tiene un
  alimento equivalente real bajo otra palabra clave: `zucchini` →
  `squash, summer`, `coconut` → `nuts, coconut`, `broth, chicken` →
  `soup, chicken broth`, `water, tap` → `beverages, water, tap`…), y cada
  palabra clave sin match es inofensiva (0 filas, no rompe nada).
- `hake`, `fish, seabream`, `cheese, manchego`, `rice, arborio`, `polenta` y
  `bread crumbs` **no están en USDA** (ni como prefijo ni en ningún otro
  sitio del dataset): se han quitado de `foods-keywords.json` en vez de
  dejarlos como palabras clave muertas. `fish, sole` es distinto: el lenguado
  sí está, pero USDA no lo separa de la platija — la única entrada es "Fish,
  flatfish (flounder and sole species)". Se ha sustituido por la palabra
  clave `fish, flatfish`, traducida como "lenguado" (con "platija" de alias).
  Se añadirán a mano el día que haga falta un alimento manual
  (`source = 'manual'`) para los seis que de verdad no existen.
- `beer` ya no engancha nada: con el límite de palabra, "Beerwurst" queda
  fuera y no hay ninguna cerveza real en Foundation/SR Legacy con ese
  prefijo. Antes de esta corrección, `beer` devolvía por error tres
  "Beerwurst" (un embutido con cerveza) etiquetados como si fueran cerveza.
- `butter` sí sigue encontrando alimentos reales, pero no necesariamente los
  mismos de una versión a otra del dataset: con la prioridad "con energía
  fiable" por delante de "Foundation", si "Butter, stick, unsalted" (sin
  macros en esta versión de Foundation) compite con "Butter, salted" o
  "Butter, Clarified butter (ghee)" (SR Legacy, con energía completa), ganan
  estos últimos y el "Butter, stick" se descarta (ver "Energía" abajo).
- La deduplicación de descripciones idénticas dentro de un mismo grupo se
  hace **después** de ordenar, no antes: si dos fdcId comparten
  `description` exacta (p. ej. dos "Oil, canola", uno de Foundation sin
  macros y otro de SR Legacy completo), gana el que el orden ya puso primero
  (el que tiene energía fiable), no el que aparece antes en el fichero de
  USDA.

### Un nombre en español, un alimento

USDA publica variantes que en una cocina son el mismo ingrediente: cultivares
(`Apples, fuji` / `gala` / `red delicious`), versiones con y sin sal añadida,
enriquecidas o no, grados de la carne. Todas caen en la misma traducción
(`manzana`), y dos filas con el mismo `nameEs` son indistinguibles en la
interfaz y para el resolutor de ingredientes. Por eso el seed **garantiza que
`nameEs` es único**: `assertUniqueNames` revienta la construcción si aparece un
duplicado, y `dedupeByNameEs` se queda con una sola fila por nombre, en este
orden de preferencia:

1. la que USDA marca como `all commercial varieties`;
2. la que **no** lleva sal añadida (`with salt` describe una variante);
3. la que tiene los tres macronutrientes publicados;
4. la descripción más corta (menos calificativos = más genérica);
5. a igualdad, la primera (el orden de `selectFoods` ya es determinista).

Los `fdcId` descartados así se apuntan a mano en `excludeIds` de
`foods-keywords.json` (el propio script los imprime al final con el nombre en
español que colisionaba). Ese paso **no es opcional**: al salir del seed, su
traducción se poda, y sin el `excludeIds` la siguiente construcción las volvería
a meter con el nombre en inglés — el seed dejaría de ser reproducible.
`excludeIds` se aplica **después** de la selección, no antes: quitarlas antes
liberaría un hueco del tope de 3 por palabra clave y metería alimentos nuevos
por un motivo que nada tiene que ver.

### Energía: 1008 → 2047 → 2048, y cuándo (no) se deriva por Atwater

Algunas entradas de Foundation Foods no publican el nutriente 1008
("Energy") sino 2047 ("Energy, Atwater General factors") o 2048 ("Energy,
Atwater Specific factors"); `build-foods-seed.ts` prueba los tres en ese
orden. Lo mismo pasa con la grasa: `1004` ("Total lipid (fat)") a veces falta
y el dato está en `1085` ("Total fat (NLEA)") — se prueban ambos.

Si ninguno de los tres nutrientes de energía existe, **solo** se deriva por
Atwater cuando proteína (1003), carbohidratos por diferencia (1005) **y**
grasa (1004/1085) están los tres publicados:

```
kcal100g = 4·proteína + 4·carbohidratos + 9·grasa
```

**Nunca** se usa `1063` ("Sugars, total") como sustituto de los
carbohidratos: azúcares totales no incluye el almidón ni buena parte de la
fibra, y usarlo como proxy infraestimaba mucho verduras y frutas con
almidón/fibra (un puerro daba 18.5 kcal en vez de las ≈61 reales). Si faltan
proteína, carbohidratos o grasa y **hay** en el mismo grupo un alimento con
energía fiable (directa o Atwater completo), esta fila se descarta de
`selectFoods` — es mejor perder una variante que enseñar un número
inventado. Si **ningún** alimento del grupo tiene energía fiable, la fila se
conserva con `kcal100g: null` e `isEstimated: true`: un "no lo sé" honesto.
`foods.json` no tiene ninguna fila con `kcal100g: null` en esta versión del
seed (todas las que se quedaban sin datos tenían un hermano con energía
real y se descartaron, o resultaron tener los tres macros completos).

### Líquidos: unidad por defecto y densidad

`defaultUnit` se decide por la **descripción** del alimento (no por la
palabra clave que lo seleccionó), con coincidencias por palabra completa para
evitar falsos positivos obvios (`watermelon`/`watercress` no son agua,
`beerwurst`/`beer salami` no es cerveza, `gelatin ... prepared with water` no
es agua). `milk` y `oil` van aparte: solo cuentan si abren la descripción o
son "coconut milk/cream" o "beverages, `<algo>` milk" — en mitad de una
frase casi siempre son un ingrediente, no el alimento
(`"Cheese, ricotta, whole milk"`, `"Seeds, ..., oil roasted"`,
`"Margarine-like, vegetable oil spread"` no son líquidos). También se
ignora la palabra si solo describe el líquido de conserva de un alimento
sólido: "canned in oil", "syrup pack", "juice pack", "water pack",
"heavy/light syrup" (fruta o pescado en lata siguen siendo gramos, aunque
vengan en almíbar, zumo, agua o aceite).

Las formas **secas** de algo que en líquido iría en mililitros no son líquidos:
`dry`, `dried`, `powder`, `granules`, `bouillon`, `instant`, `mix` (salvo que
la descripción diga `prepared`, como el gelificado preparado con agua) se pesan.
Sin esto, "Soup, chicken broth or bouillon, dry" entraba por `broth` como si
fuera caldo. Las que además vienen en piezas contables (`cube`/`cubes`) se
cuentan: "Soup, chicken broth cubes, dry" es `defaultUnit: 'ud'` con
`gramsPerUnit: 10` (una pastilla) en `foods-translations.json`.

La miel se queda en gramos a propósito, aunque sea líquida: en la despensa se
pesa (el bote lo dice en gramos), y para recetas que la miden por cucharada
está `gramsPerTbsp` (21 g). `nectar` sí es líquido (mililitros, densidad
1.04) — antes se pesaba por no estar en la lista de palabras clave de
líquidos.

Densidad (g/ml) por palabra clave de la descripción, de más a menos
específica, con 1.0 por defecto para un líquido reconocido que no está en la
tabla. La miel no aparece aquí: como nunca cuenta como líquido, una fila de
densidad para ella sería inalcanzable y daría una falsa sensación de que se
usa en algún sitio.

| Categoría | Densidad |
|---|---|
| Aceites | 0.91 |
| Siropes/jarabes | 1.33 |
| Salsa de soja | 1.18 |
| Vinagre | 1.01 |
| Leche / bebida de soja | 1.03 |
| Nata | 1.0 |
| Zumos / néctares | 1.04 |
| Vino | 0.99 |
| Destilados | 0.94 |
| Agua / caldo / stock | 1.0 |

### Traducciones (`foods-translations.json`)

`foods-translations.json` mapea `sourceRef` (el `fdcId` de USDA, como string) a
`{ nameEs, aliases, gramsPerCup, gramsPerTbsp, gramsPerUnit, densityGPerMl,
allergens, seasonalMonths }`. **Es el fichero que manda**: `build-foods-seed.ts`
nunca lo sobrescribe, solo lo lee.

`scripts/translate-foods.ts` puede generar entradas que falten usando un modelo
de lenguaje local (llama-server, Ollama u otro servidor compatible con la API
de OpenAI) configurado por `AI_LOCAL_BASE_URL` / `AI_LOCAL_MODEL`:

```bash
AI_LOCAL_BASE_URL=http://localhost:8080/v1 AI_LOCAL_MODEL=qwen3-8b pnpm tsx scripts/translate-foods.ts
```

El script **nunca pisa una entrada ya existente** en `foods-translations.json`:
solo rellena los `sourceRef` que faltan. Las 573 traducciones actuales se
redactaron y se revisaron a mano (nombre en español tal como lo escribiría
alguien de casa en una receta: singular, minúsculas, sin jerga de USDA ni
marcas comerciales), sin depender de ningún servidor local. El fichero solo
guarda entradas para alimentos que están en `foods.json`: cuando una
reselección o un deduplicado saca un `fdcId` del seed, su traducción se
quita también (no queda huérfana estorbando futuras revisiones). Cualquier
corrección futura se hace editando este JSON directamente, nunca el prompt
del script ni `foods.json`.

### Cómo añadir una palabra clave

1. Añade la palabra (en inglés, tal como aparece al principio de la
   `description` de USDA) a la lista `keywords` de `foods-keywords.json`. Si
   hace falta excluir un caso concreto, añade una entrada a `exclude`.
2. Vuelve a correr `pnpm tsx scripts/build-foods-seed.ts --input ./data/usda`.
   Los alimentos nuevos aparecerán en `foods.json` con `nameEs = nameEn`
   (el inglés) hasta que se les añada una entrada en
   `foods-translations.json`.
3. Traduce a mano las entradas nuevas (o corre `translate-foods.ts` si hay un
   servidor local disponible) y vuelve a generar el seed para confirmar
   `0 sin traducción`.
4. Corre `pnpm db:seed` (o `seedFoods` en los tests) para comprobar que el
   upsert por `(source, source_ref)` no duplica filas.
