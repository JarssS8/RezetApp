# Rezet — frontend

App completa y funcional: React 18 + TypeScript + Vite. Sin dependencias de UI.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # reglas de negocio
npm run build    # dist/
```

Arranca con datos de demo (8 recetas, 13 ítems de despensa, plan de la semana) y
todo funciona: navegación, buscar y filtrar, crear recetas, arrastrar al plan,
cocinar con temporizadores, despensa que se descuenta, lista de la compra, tema
claro/oscuro, cuatro acentos, métrico/imperial y español/inglés. El estado se
guarda en `localStorage`.

## Apps nativas con Capacitor

Capacitor envuelve el build web en proyectos nativos de Xcode y Android Studio,
así que **esta misma base de código va a App Store y Play Store**. No hace falta
React Native ni Expo: sería reescribir la interfaz entera.

```bash
npm i @capacitor/core && npm i -D @capacitor/cli
npx cap init                       # ya hay capacitor.config.ts preparado
npm i @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
npm run cap:ios                    # build + sync + abre Xcode
npm run cap:android
```

Ya está resuelto en el diseño lo que suele romperse al pasar a nativo: áreas
seguras con `env(safe-area-inset-*)`, áreas táctiles de 44px, gestos con
`pointer-events` (funcionan igual con dedo y con ratón) y `viewport-fit=cover`.

Plugins que conviene añadir cuando toque: `@capacitor/local-notifications` para
que los temporizadores de cocina avisen con la app cerrada, `@capacitor/haptics`
para sustituir `navigator.vibrate` por haptics nativos, y `@capacitor/camera`
para las fotos de los platos.

## Mapa del código

```
src/
  domain/      Reglas de negocio puras, con tests. Sin React, sin red.
  data/        seed.ts (datos de demo) y store.tsx (estado + acciones)
  store/       prefs.tsx: tema, acento, idioma, unidades
  motion/      Muelle, proyección de momento, arrastre de hoja y de receta
  ui/          Primitivos: Button, Chip, Card, Stepper, CheckRow, Sheet, Icon…
  screens/     Login, Onboarding, Today, Recipes, RecipeDetail, RecipeForm,
               Plan, Pantry, Cook
  sheets/      Settings, Shopping, PantryAdd, RecipePicker, CookFinish
  app/         AppShell: barra lateral ≥900px / barra inferior por debajo
  i18n/        es.ts, en.ts
  styles/      tokens.css: el sistema de color completo
```

## Conectar el backend

Todo el acceso a datos pasa por `src/data/store.tsx`. Ese es el único archivo que
hay que reescribir: sustituye el cuerpo de las acciones por llamadas de red y
añade TanStack Query si quieres caché y revalidación. Las firmas y las reglas de
negocio no cambian, así que **las pantallas no se tocan**.

Tres acciones tienen que ser transaccionales en el servidor, porque tocan varias
tablas y no pueden quedarse a medias. Están marcadas en el código y
especificadas en `../BUILD_FROM_ZERO.md` §5:

| Acción del store | RPC del servidor |
|---|---|
| `finishCook` | `rpc/finish_cook` — resta de la despensa, marca el plan, registra el cocinado |
| `buyChecked` | `rpc/buy_checked` — suma a la despensa y limpia las marcas |
| `saveRecipe` | `rpc/save_recipe` — receta, ingredientes, pasos y su relación de una vez |

El esquema de base de datos con RLS está en `../BUILD_FROM_ZERO.md` §3.

## Reglas que no se negocian

- Los colores salen de `styles/tokens.css`. No hay hex sueltos en componentes.
- `--accent`/`--warn` son **rellenos**. El texto sobre fondo claro o tintado usa
  `--accent-ink`/`--warn-ink`; el texto encima de un relleno de acento usa
  `--onaccent` (blanco). Confundirlos baja el contraste por debajo de 4.5:1.
- Las reglas de negocio viven en `domain/`, son puras y tienen tests. No se
  duplica esa lógica en componentes: el escalado de ingredientes lo usan cuatro
  pantallas y tiene que dar el mismo número en las cuatro.
- Los temporizadores de cocina se guardan como **instante de fin absoluto**,
  nunca como segundos restantes. Es lo que hace que sigan siendo correctos si la
  pantalla se apaga o la app se recarga.
- Sin librerías de componentes con tema propio: traen radios, alturas y sombras
  que pisan los del diseño.

## Qué falta antes de publicar

1. Backend real y auth (ahora es `localStorage`).
2. Fotos de los platos. Los sitios están marcados con un marcador monoespaciado;
   sustitúyelos por imágenes reales, no por ilustraciones generadas.
3. Notificaciones locales para los temporizadores con la app en segundo plano.
4. Relación paso→ingrediente en el modelo de datos. Ahora se deduce del texto
   del paso, que funciona bien pero es una heurística: `recipe_step_ingredient`
   la vuelve exacta. El código ya usa `step.ingredientIds` si existe.
5. Anillo de foco visible con `--accent` en los inputs (los primitivos ya
   quitan el `outline` por defecto).
6. PWA con `vite-plugin-pwa` si además quieres instalación desde el navegador.

La especificación de diseño completa está en `../README.md`. Ante cualquier duda
visual, `../RezetApp.dc.html` es la fuente de verdad.
