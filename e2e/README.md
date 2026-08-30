# E2E (Playwright)

## Chromium headless shell: `libnspr4.so` ausente

En este entorno (Ubuntu 24.04, sin `sudo`) el shell headless de Chromium que
descarga Playwright falla al arrancar con:

```
error while loading shared libraries: libnspr4.so: cannot open shared object file
```

El resto de dependencias de Chromium (`libatk`, `libcups`, `libasound`, …) ya
están instaladas en el sistema (como paquetes `*t64`); solo faltan
`libnspr4` y `libnss3`. Se resuelve extrayendo esos `.deb` en el espacio de
usuario, sin `apt install`:

```bash
mkdir -p ~/.local/chromium-deps && cd ~/.local/chromium-deps
apt-get download libnspr4 libnss3
for d in *.deb; do dpkg -x "$d" .; done
```

Y ejecutando Playwright con:

```bash
export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu
pnpm exec playwright test
```

Si en otro entorno faltan más librerías, el error de Chromium las nombra una
a una (p. ej. `libXcomposite.so.1` → paquete `libxcomposite1`); se añaden al
mismo `apt-get download` y no hace falta ampliar `LD_LIBRARY_PATH` (todo
queda bajo el mismo directorio `usr/lib/x86_64-linux-gnu`).

## `e2e/recipes.spec.ts` necesita el seed de alimentos en la base de dev

Sin `E2E_BASE_URL`, Playwright levanta la app con `pnpm dev`, que usa
`DATABASE_URL` (la base de **desarrollo**, no `DATABASE_URL_TEST`). El
análisis de ingredientes de la receta de prueba ("lentejas", "cebolla",
"sal") solo reconoce alimentos si esa base tiene el catálogo cargado:

```bash
pnpm db:migrate && pnpm db:seed
```

El seed es idempotente (upsert por clave natural): se puede ejecutar tantas
veces como haga falta sin duplicar nada. Después:

```bash
export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu
pnpm exec playwright test e2e/recipes.spec.ts
```

## `e2e/cache.spec.ts` necesita un build de producción (Ruling W10-R3)

Dos de los cuatro tests de este fichero — la ventana de cliente
(`x-nextjs-stale-time`) y el armazón compartido sin datos de ningún hogar —
comprueban algo que **solo existe en `pnpm build` + `pnpm start`**. En
desarrollo (`pnpm dev`), Next desactiva el prefetch de rutas y sirve cada
navegación como una petición dinámica nueva: no hay armazón prerenderizado
que devuelva la cabecera, así que medir la ventana de caché de cliente contra
`pnpm dev` no prueba nada — pasaría o fallaría por una razón que no tiene que
ver con la caché. De ahí que estos dos tests se salten con
`test.skip(!process.env.E2E_BASE_URL, …)`: no rompen `pnpm e2e` normal, y
solo corren cuando se les da explícitamente un servidor de producción.

Secuencia para correrlos de verdad (contra una base de datos de pruebas, sin
tocar el contenedor Docker que ya ocupa el puerto 3000):

```bash
docker compose up -d db
pnpm db:migrate && pnpm db:seed

pnpm build
PORT=3100 APP_URL=http://localhost:3100 ALLOW_OPEN_REGISTRATION=true pnpm start &

export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu
E2E_BASE_URL=http://localhost:3100 pnpm exec playwright test --workers=1 e2e/cache.spec.ts
```

Notas de la secuencia:

- **`ALLOW_OPEN_REGISTRATION=true` es obligatorio.** Los cuatro tests
  registran un hogar nuevo con `registerHousehold`; con el registro cerrado
  el formulario nunca pinta el campo de nombre y el test se cuelga esperando
  un elemento que no va a aparecer, en vez de fallar con un mensaje claro.
- **`pnpm exec playwright test`, no `pnpm e2e --`.** `pnpm e2e -- --workers=1
  e2e/cache.spec.ts` reenvía un `--` literal a Playwright en este `pnpm`, y
  el resultado es la suite entera con más workers de los pedidos en vez del
  fichero y el paralelismo que se pidieron. Llamar a `playwright test`
  directamente evita el problema.
- **`--workers=1`** porque el test de invalidación por REST y el del armazón
  compartido registran hogares y escriben sobre la misma base; en paralelo,
  dos workers podrían pisarse la caché en memoria del único proceso de Next.
- El puerto **3100** es a propósito distinto del 3000 que ocupa
  `rezetapp-app-1` (el contenedor de `docker compose up -d`): así la medida
  no compite por caché ni por conexiones con lo que ya esté corriendo.
- Para el criterio 2 de W10 (los 20 specs contra un build de producción, no
  solo estos cuatro), la misma secuencia sirve quitando el nombre del
  fichero del último comando — pero **sigue haciendo falta `pnpm exec
  playwright test`**, nunca `pnpm e2e -- --workers=1`: el `--` que reenvía
  este `pnpm` rompe el `--workers=1` pase lo que pase detrás (se comprobó con
  `--list`: siguen saliendo 4 workers), tenga o no un fichero de más.
