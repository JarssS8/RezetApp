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
`foods.json` resultante (631 alimentos, muy por debajo de 1 MB).

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

- De las 294 palabras clave, 251 tuvieron al menos una coincidencia; 43 no
  encontraron nada porque USDA nombra el alimento de otra forma (p. ej.
  `zucchini` está en USDA como "Squash, summer, zucchini…", no como
  "Zucchini…"). No es un fallo: es el límite de un criterio por prefijo, y
  cada palabra clave sin match es inofensiva (0 filas, no rompe nada).
- `hake`, `fish, seabream`, `fish, sole`, `cheese, manchego`, `rice, arborio`,
  `polenta` y `bread crumbs` **no están en USDA** (ni como prefijo ni en
  ningún otro sitio del dataset): se han quitado de `foods-keywords.json` en
  vez de dejarlos como palabras clave muertas. Se añadirán a mano el día que
  haga falta un alimento manual (`source = 'manual'`) para cada uno.
- `beer` ya no engancha nada: con el límite de palabra, "Beerwurst" queda
  fuera y no hay ninguna cerveza real en Foundation/SR Legacy con ese
  prefijo. Antes de esta corrección, `beer` devolvía por error tres
  "Beerwurst" (un embutido con cerveza) etiquetados como si fueran cerveza.
- `butter` sí sigue encontrando alimentos reales, pero no necesariamente los
  mismos de una versión a otra del dataset: con la prioridad "con energía
  conocida" por delante de "Foundation", si "Butter, stick, unsalted" (sin
  macros en esta versión de Foundation) compite con "Butter, salted" o
  "Butter, Clarified butter (ghee)" (SR Legacy, con energía completa), ganan
  estos últimos. Es preferible tener 3 alimentos con datos reales a 2 con
  datos reales y 1 sin ellos.

### Energía: 1008 → 2047 → 2048, y derivación por Atwater

Algunas entradas de Foundation Foods no publican el nutriente 1008
("Energy") sino 2047 ("Energy, Atwater General factors") o 2048 ("Energy,
Atwater Specific factors"); `build-foods-seed.ts` prueba los tres en ese
orden. Lo mismo pasa con la grasa: `1004` ("Total lipid (fat)") a veces falta
y el dato está en `1085` ("Total fat (NLEA)") — se prueban ambos.

Si ninguno de los tres nutrientes de energía existe, se deriva por Atwater:

```
kcal100g = 4·proteína + 4·(carbohidratos o, si faltan, azúcares totales) + 9·grasa
```

usando 0 para lo que falte, y se marca `isEstimated: true` en ese alimento
(columna `is_estimated` de `foods`). Para un alimento sin ningún
macronutriente publicado (p. ej. "Salt, table, iodized", que en esta versión
de Foundation no trae ni proteína ni grasa ni carbohidratos) esto da 0 kcal,
que es el valor correcto: no hay en este seed ningún caso de "sin datos" que
no sea, en la práctica, una sustancia sin energía (sal, agentes leudantes).
`kcal.json`/`foods.json` no tiene ninguna fila con `kcal100g: null`.

### Líquidos: unidad por defecto y densidad

`defaultUnit` se decide por la **descripción** del alimento (no por la
palabra clave que lo seleccionó), con coincidencias por palabra completa para
evitar falsos positivos obvios (`watermelon`/`watercress` no son agua,
`beerwurst`/`beer salami` no es cerveza). `milk` y `oil` van aparte: solo
cuentan si abren la descripción o son "coconut milk/cream" o
"beverages, `<algo>` milk" — en mitad de una frase casi siempre son un
ingrediente, no el alimento (`"Cheese, ricotta, whole milk"`,
`"Seeds, ..., oil roasted"`, `"Margarine-like, vegetable oil spread"` no son
líquidos). También se ignora la palabra si solo describe el líquido de
conserva de un alimento sólido: "canned in oil", "syrup pack", "juice pack",
"water pack", "heavy/light syrup" (fruta o pescado en lata siguen siendo
gramos, aunque vengan en almíbar, zumo, agua o aceite).

Densidad (g/ml) por palabra clave de la descripción, de más a menos
específica, con 1.0 por defecto para un líquido reconocido que no está en la
tabla:

| Categoría | Densidad |
|---|---|
| Aceites | 0.91 |
| Miel | 1.42 |
| Siropes/jarabes | 1.33 |
| Salsa de soja | 1.18 |
| Vinagre | 1.01 |
| Leche / bebida de soja | 1.03 |
| Nata | 1.0 |
| Zumos | 1.04 |
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
solo rellena los `sourceRef` que faltan. Las 631 traducciones actuales (610
de la primera versión más 75 nuevas de la ronda de correcciones, con 54 bajas
por deduplicado/reselección) se redactaron y se revisaron a mano (nombre en
español tal como lo escribiría alguien de casa en una receta: singular,
minúsculas, sin jerga de USDA ni marcas comerciales), sin depender de ningún
servidor local. Cualquier corrección futura se hace editando este JSON
directamente, nunca el prompt del script ni `foods.json`.

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
