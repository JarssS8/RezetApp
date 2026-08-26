# RezetApp

Self-hosted recipe manager with a meal planner, pantry tracking, calorie
counts, and an MCP endpoint so an AI assistant can drive it. Multi-household:
several people in the same home share data. Open source, no paid features.

## Installation

```bash
cp .env.example .env
# Edit .env and set a real APP_SECRET: openssl rand -base64 48
docker compose up -d
```

Open `http://localhost:3000`.

## Requirements

- Passkeys need HTTPS or `localhost`. If you access the app over a bare IP or a
  domain without TLS, the browser will refuse to create or use passkeys.
- No SMTP server needed: there is no email verification or password recovery
  by email.
- No S3 or external storage needed: images are stored on the local
  `./data/uploads` volume.

## Development

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Useful commands:

```bash
pnpm check              # typecheck + lint + i18n + unit tests
pnpm test -- <path>     # a single test file
pnpm exec playwright install --with-deps chromium  # once (may need sudo)
pnpm e2e                # end-to-end tests with Playwright
```

## Privacy: zero telemetry

RezetApp does not send anything anywhere on its own. The only outbound
connections are the ones you explicitly configure:

- The AI provider you pick in Settings (a cloud API or your own local
  OpenAI-compatible server).
- Open Food Facts, when scanning a barcode in the pantry.
- ShopList, if you enable sending the shopping list.

With none of those configured, the app works entirely without reaching the
internet.

## Data licenses

- **USDA FoodData Central** — nutritional data in the public domain.
- **[Open Food Facts](https://world.openfoodfacts.org)** — product data under
  the [ODbL](https://opendatacommons.org/licenses/odbl/) license. Using this
  data requires attributing Open Food Facts and sharing any derived database
  under the same license.

## ShopList integration

RezetApp does not have a shopping list: it works out what's missing and pushes
it to ShopList. See [`docs/06-SHOPLIST.md`](docs/06-SHOPLIST.md) for the
contract between the two apps.

## MCP

RezetApp exposes an MCP endpoint at `/mcp` so it can be driven from a desktop
MCP client. See [`docs/05-MCP.md`](docs/05-MCP.md) (phase W3).
