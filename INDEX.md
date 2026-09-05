# Rezet — paquete de diseño e implementación

Cinco piezas. Empieza por la que corresponda a lo que vas a hacer.

| Archivo / carpeta | Para qué |
|---|---|
| **`PROMPT_CLAUDE_CODE.md`** | **Empieza aquí si vas a construir con Claude Code.** El prompt de arranque, listo para pegar: le hace leer el paquete, preguntarte todas las decisiones técnicas, enseñarte un plan y esperar tu aprobación antes de escribir una línea. |
| **`app/`** | **El frontend completo, ya escrito.** React 18 + TypeScript + Vite, sin dependencias de UI. `npm install && npm run dev` y funciona con datos de demo. Listo para envolver con Capacitor y publicar en las stores. |
| `BUILD_FROM_ZERO.md` | Levantar el backend y el proyecto de cero: esquema de Postgres con RLS, contrato de las tres RPC transaccionales, hitos con criterios de aceptación, `CLAUDE.md` del repo y un prompt por hito para Claude Code. |
| `README.md` | La especificación de diseño: cada pantalla, tokens, tipografía, movimiento, reglas de negocio y copy. Es la referencia cuando algo no cuadre. |
| `tokens.css` | El sistema de color completo (también copiado en `app/src/styles/`). |
| `motion.js` | Muelle, proyección de momento y rubber-banding, sin dependencias (portado a TS en `app/src/motion/`). |
| `RezetApp.dc.html` | El prototipo original. Ábrelo en el navegador: es la fuente de verdad visual. |

## Ruta rápida

```bash
cd app
npm install
npm run dev      # la app entera, funcionando
npm test         # 24 tests de las reglas de negocio
```

Después, en este orden:

1. Levanta la base de datos con el esquema de `BUILD_FROM_ZERO.md` §3 (RLS en **todas** las tablas).
2. Reescribe las acciones de `app/src/data/store.tsx` para que llamen a tu API. Es el único archivo que hay que tocar: las pantallas no cambian.
3. Implementa `finish_cook`, `buy_checked` y `save_recipe` como transacciones de servidor (§5).
4. Envuelve con Capacitor: `npm i @capacitor/core && npx cap init` (ya hay `capacitor.config.ts`).

## Lo que hay que tener claro antes de tocar código

- `--accent` y `--warn` son **rellenos**. El texto sobre fondo claro o tintado usa `--accent-ink` / `--warn-ink`; el texto encima de un relleno de acento usa `--onaccent` (blanco). Confundirlos deja el contraste por debajo de 4.5:1 en toda la app.
- Las reglas de negocio viven en `app/src/domain/`, son puras y tienen tests. El escalado de ingredientes lo usan cuatro pantallas y tiene que dar el mismo número en las cuatro.
- Los temporizadores de cocina se guardan como instante de fin absoluto, nunca como segundos restantes.
- Sin librerías de componentes con tema propio: traen radios, alturas y sombras que pisan las del diseño.
- No hay imágenes generadas. Los sitios donde van fotos reales están marcados; sustitúyelos por fotografías, no por ilustraciones.
