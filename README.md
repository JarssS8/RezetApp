# RezetApp

Recetario self-hosted con planificador de comidas, despensa, conteo de calorías
y un endpoint MCP para que un asistente de IA lo maneje. Multi-hogar: varias
personas de una misma casa comparten datos. Open source, sin funciones de pago.

## Instalación

```bash
cp .env.example .env
# Edita .env y pon un APP_SECRET real: openssl rand -base64 48
docker compose up -d
```

Abre `http://localhost:3000`.

## Quién puede registrarse

La primera persona que abre la instancia crea su cuenta y su hogar; a partir de
ahí el registro queda **cerrado** y las siguientes entran por invitación (Ajustes
→ Miembros). Para abrirlo a cualquiera, pon `ALLOW_OPEN_REGISTRATION=true` en
`.env` (útil en una instancia de pruebas o en una red de confianza).

## Requisitos

- Las passkeys necesitan HTTPS o `localhost`. Si accedes por IP o por un dominio
  sin TLS, el navegador no dejará crear ni usar passkeys.
- No hace falta servidor SMTP: no hay verificación de email ni recuperación de
  contraseña por correo.
- No hace falta S3 ni ningún almacenamiento externo: las imágenes se guardan en
  el volumen local `./data/uploads`.

## Desarrollo

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Comandos útiles:

```bash
pnpm check              # typecheck + lint + i18n + tests + cobertura de dominio
pnpm test -- <ruta>     # un solo archivo de test
pnpm exec playwright install --with-deps chromium  # una vez (puede pedir sudo)
pnpm e2e                # tests end-to-end con Playwright
```

## Privacidad: cero telemetría

RezetApp no envía nada a ningún sitio por su cuenta. Las únicas conexiones
salientes son las que tú configuras explícitamente:

- El proveedor de IA que elijas en Ajustes (API en la nube o tu propio servidor
  local compatible con OpenAI).
- Open Food Facts, al escanear un código de barras en la despensa.
- ShopList, si activas el envío de la lista de la compra.

Sin ninguna de esas configuraciones, la app funciona por completo sin salir a
internet.

## Licencias de datos

- **USDA FoodData Central** — datos nutricionales en dominio público.
- **[Open Food Facts](https://world.openfoodfacts.org)** — datos de productos
  bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/). El uso de
  estos datos requiere atribuir a Open Food Facts y compartir bajo la misma
  licencia cualquier base de datos derivada.

## IA opcional

La IA es opcional en todo momento: sin proveedor configurado, RezetApp sigue
siendo un recetario completo (analizar ingredientes, importar recetas,
estimar nutrición y proponer semanas de menú son las únicas funciones que la
usan). Cada hogar elige su proveedor en Ajustes → Inteligencia artificial:
Anthropic, OpenAI, o un servidor propio compatible con la API de OpenAI.

Para un servidor local, la opción recomendada es
[`llama-server`](https://github.com/ggml-org/llama.cpp) con un modelo qwen3
cuantizado (Q4_K_M): `qwen3-4b` para GPUs de 4 GB o `qwen3-8b` para 8 GB.

```bash
llama-server -m qwen3-8b-q4_k_m.gguf -ngl 99 -c 8192 -fa --jinja --port 8080
```

Apunta `AI_LOCAL_BASE_URL` (o la URL del servidor en Ajustes) a
`http://localhost:8080/v1`. Ollama sirve igual de bien: expone la misma API en
`/v1` (`http://localhost:11434/v1`), así que basta con apuntar ahí y usar el
nombre del modelo que hayas descargado con `ollama pull`.

## Integración con ShopList

RezetApp no lleva lista de la compra: calcula qué falta y lo empuja a ShopList.
Ver [`docs/06-SHOPLIST.md`](docs/06-SHOPLIST.md) para el contrato entre ambas.

## MCP

RezetApp expone un endpoint MCP en `/mcp` para manejar el recetario desde un
cliente MCP de escritorio o un asistente de código. Cómo conectarlo (token,
configuración del cliente y una prueba manual con `curl`) en la sección
["Conexión" de `docs/05-MCP.md`](docs/05-MCP.md#conexión).
