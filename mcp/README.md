# rezet-mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant
create recipes and manage the weekly plan, pantry, and shopping list for the Rezet app — against the
same Supabase project, the same RLS-protected tables, and the same transactional RPCs the real app
(`../app`) uses. It reuses `../app/src/domain/*` by relative import, so scaling/coverage/shopping math is
never duplicated. `../app/src/data/*` is never touched to support this server.

10 tools: `list_recipes`, `get_recipe`, `create_recipe`, `get_week_plan`, `add_to_plan`,
`remove_from_plan`, `get_pantry`, `add_pantry_item`, `get_shopping_list`, `cook_recipe`.

This package has two entrypoints sharing that same tool surface — this document covers the stdio
server first (below), then the hosted remote server in "[Remote server
(Cloudflare)](#remote-server-cloudflare)" at the end.

## stdio vs. remote — which one should I use?

| | stdio (`.mcp.json` → `rezet`) | remote (`https://rezet-mcp.jarsss8.es/mcp`) |
|---|---|---|
| who | you, on this machine | any Rezet user, any MCP client |
| auth | one persisted Supabase session (`npm run login`) | OAuth per client, sign in with Google or Apple |
| when | developing/testing tools against the live DB without deploying | daily use — Claude.ai, Claude Desktop, phone |

They hit the same backend and, per signed-in account, the same household — nothing stops you from
registering both at once (see "Connecting" below for adding the remote one to Claude Code too).

## Setup

1. **Env vars.** Copy `.env.example` to `.env` and fill in `SUPABASE_URL` / `SUPABASE_ANON_KEY` (the
   same public values as `app/.env.local`'s `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). If `mcp/.env`
   doesn't exist, the server falls back to reading `../app/.env.local` directly, so a fresh checkout that
   already has the app configured needs no extra file.
2. **Install deps** (already done if you're reading this after Phase A–D, but for a clean checkout):
   ```bash
   cd mcp
   npm install
   ```
3. **Log in once:**
   ```bash
   npm run login
   ```
   This opens a browser to Google sign-in (PKCE flow) and persists a session to
   `~/.config/rezet-mcp/session.json`. See the security note below before running this on a shared
   machine. Use `npm run login -- --logout` to remove the stored session, or `npm run login -- --provider
   apple` to sign in with a different provider.
4. **Register the server with Claude Code** (already done in this repo's `.mcp.json` — see below) and
   **reconnect**: restart Claude Code, or run `/mcp` inside a session in this repo, to pick up the server.
   Run `claude mcp list` or `/mcp` to confirm `rezet` shows as connected.

No build step — `npm start` / the registered server both run `src/index.ts` directly via `tsx`.

## Security: the session file is a live credential

`~/.config/rezet-mcp/session.json` (mode `0600`) holds a Supabase access token **and refresh token** for
the signed-in Google account — functionally equivalent to a logged-in browser session for that account's
household. Treat it like a password:

- Don't copy it to another machine or commit it (it lives outside the repo and is also covered by
  `.gitignore` defensively).
- `npm run login -- --logout` deletes it and revokes nothing server-side by itself.
- The web app's plain "Sign out" only ends that device's session (`scope: 'local'`) and does **not** revoke
  this server. To revoke it, use **Account & household → Sign out on all devices** (`scope: 'global'`) with
  the account this server uses — the next tool call will fail with a session error and you'll need to run
  `npm run login` again.
- One running server instance == one signed-in user == one household. There's no `service_role`, no
  per-call auth, and no multi-tenant support — don't point one instance at multiple households or share the
  session file between users.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server fails to start, stderr says "No Rezet session" | Never logged in, or `session.json` missing/corrupt | `npm run login` |
| Tool call fails with "rezet: session expired or missing" | Refresh token expired, revoked, or rotated away (e.g. signed out in the app, or another process raced the same session file) | `npm run login` again, then restart/reconnect the MCP server |
| Server fails to start, stderr mentions `SUPABASE_URL`/`SUPABASE_ANON_KEY` | No `mcp/.env` and no `../app/.env.local` (or missing keys in either) | Create `mcp/.env` from `.env.example`, or ensure `app/.env.local` has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` |
| "Signed in as … but this account has no household" | The Google/Apple account has no `profile` row / household yet | Open the app, sign in with the same account, and create or join a household first |
| Tool call fails with `rezet: invalid value: … Allowed units: g, ml, ud, tbsp` | Passed a unit outside the live Postgres `unit` enum | Use one of `g`, `ml`, `ud`, `tbsp` |
| Tool call fails with `rezet: constraint violated: …` | A DB check constraint rejected the input (e.g. `servings` outside 1–24) | Adjust the input to satisfy the constraint named in the message |
| Tool call fails with `rezet: not allowed / not found in this household` | RLS filtered the row — wrong id, or it belongs to a different household | Double-check the id came from a prior `list_recipes`/`get_week_plan`/`get_pantry` call in this session |
| `add_to_plan`/`cook_recipe`/etc. say "recipe not found in this household" | Stale or wrong `recipeId` | Re-run `list_recipes` or `get_recipe` to get a current id |
| Dates in `add_to_plan` land on the wrong day | Server process timezone doesn't match the household's local timezone | Confirm the `TZ` env var on the server registration (this repo's `.mcp.json` sets `TZ=Europe/Madrid`) |
| `cook_recipe` called without meaning to | It subtracts from the pantry immediately and is not easily undone | Always confirm with the user before calling `cook_recipe`; there is no "undo" tool |

Every tool error is prefixed `rezet:` and printed in the model-visible tool result; unexpected/network
errors also get a full stack trace on the server's stderr (visible via `claude mcp list` / server logs),
never in the tool result itself. (The rows above are all stdio-server symptoms; for the remote server see
the table right below, and "[Remote server (Cloudflare)](#remote-server-cloudflare)" for how it's run.)

### Remote server (`rezet-mcp.jarsss8.es`) troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Client shows `invalid_grant` when it tries to refresh | The underlying Supabase refresh token expired or was revoked (e.g. you used "Sign out on all devices" in the Rezet web app with that account, `scope: 'global'`) | Reconnect the connector/server in your AI client and sign in again |
| Browser lands on a "no household yet" page after choosing Google/Apple | That account has no `profile` row / household | Open `https://rezet.jarsss8.es`, sign in with the same account, create or join a household, then reconnect |
| Sign-in fails partway with a Supabase redirect/allowlist error (`redirect_to` not allowed, or similar) | The Worker's `/callback` URL (prod or `localhost:8787`) isn't in Supabase's redirect allow-list | Add it in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs |
| TLS/certificate error on first visit to `https://rezet-mcp.jarsss8.es` | The custom domain was just created and the certificate is still provisioning | Wait a few minutes and retry; if a different subdomain shape was ever tried for this Worker, see the subdomain-nesting note under "Architecture" below |

### Remote server (`src/worker/`) — local OAuth testing

Always run `npm run dev:worker` (which points at `wrangler.dev.jsonc`), **not** plain `wrangler dev`
(which reads `wrangler.jsonc`), for local testing. `wrangler.jsonc`'s `routes: [{ pattern:
"rezet-mcp.jarsss8.es", custom_domain: true }]` makes `wrangler dev` simulate every request as if it
arrived at that production hostname — regardless of the actual `Host` header sent to `localhost:8787` —
because `@cloudflare/workers-oauth-provider@0.10.3` derives its issuer and endpoint URLs
(`/.well-known/oauth-authorization-server`, the `/authorize` and `/token` URLs in that metadata) from
`new URL(request.url).origin`, and it has no `issuer`/`baseUrl` override option. Under plain `wrangler
dev`, an external MCP client following that metadata would try to reach `rezet-mcp.jarsss8.es`, not your
local server. `wrangler.dev.jsonc` is identical to `wrangler.jsonc` minus `routes`, which fixes it —
confirmed with `curl .../.well-known/oauth-authorization-server` returning `http://localhost:8787` issuer
URLs under `-c wrangler.dev.jsonc` vs. the production hostname under the default config. (Also see
"Operating it" under "Remote server (Cloudflare)" below, which points here for local dev.)

## Claude Code registration (recommended path)

Already wired up in this repo's `/home/jars/Programing/Rezet/.mcp.json`:

```json
"rezet": {
  "type": "stdio",
  "command": "/home/jars/Programing/Rezet/mcp/node_modules/.bin/tsx",
  "args": ["/home/jars/Programing/Rezet/mcp/src/index.ts"],
  "env": { "TZ": "Europe/Madrid" }
}
```

`.mcp.json` is committed and contains no secrets — the Supabase URL/anon key and the session both live
outside it (env file and `~/.config/rezet-mcp/`). After `npm run login`, restart Claude Code or run `/mcp`
in this repo to connect.

## Claude Desktop registration (optional)

Same `mcpServers.rezet` object as above (minus `"type"`), in:

- Linux: `~/.config/Claude/claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows host with the repo in WSL (this machine): `%APPDATA%\Claude\claude_desktop_config.json`, wrapped
  through `wsl.exe` since Claude Desktop runs on Windows but the server and its `tsx` binary live in the
  Linux filesystem:
  ```json
  { "mcpServers": { "rezet": {
    "command": "wsl.exe",
    "args": ["-d", "<distro name from `wsl -l`>", "--",
      "/home/jars/Programing/Rezet/mcp/node_modules/.bin/tsx",
      "/home/jars/Programing/Rezet/mcp/src/index.ts"]
  } } }
  ```
  Run `npm run login` from a WSL shell first — Claude Desktop only needs the already-persisted session, it
  never drives the login flow itself.

## Remote server (Cloudflare)

The Worker at `mcp/src/worker/index.ts` puts a real OAuth 2.1 handshake in front of the same tool
surface, so any Rezet user — not just the person who ran `npm run login` on this machine — can connect
their own AI client and act as themselves, scoped to their own household by RLS. As of this writing it
has not been deployed yet (deploy is a separate, human-gated step); the sections below describe the
target URL, `https://rezet-mcp.jarsss8.es/mcp`, and how to operate it once it is live.

### Architecture

The client's first `POST /mcp` gets a `401` pointing it at OAuth discovery metadata; from there it
dynamically registers itself, and a browser opens on `/authorize`. That page is our own consent screen
("`<client>` wants access to your Rezet household — Continue with Google / Continue with Apple"), not
Supabase's — we render it ourselves so a maliciously-registered client can't silently reuse an
already-signed-in browser session. Choosing a provider hands the browser to Supabase Auth's own
`/authorize?provider=google|apple`, which runs the normal Google/Apple sign-in and redirects back to our
`/callback` with a Supabase auth code. We exchange that code for a Supabase session, look up the
household via the `profile` table (same query the app makes), and — only then — mint our own grant and
send the browser back to the client with an authorization code of ours. From that point every `POST /mcp`
carries a Worker-issued access token; the Worker decrypts the matching grant, builds a per-request
supabase-js client authenticated as that Supabase user, and runs the same `register(server, ctx)` tool
files the stdio server uses. There is no Durable Object and no protocol-level session — `createMcpHandler`
builds a fresh server per request, which is fine because every tool already reads fresh from Supabase.

Two token families exist side by side and are never mixed:

| Token | Issued by | Held by | Lifetime | Used for |
|---|---|---|---|---|
| Worker access token (+ refresh token) | `@cloudflare/workers-oauth-provider` | the MCP client | access 45 min, refresh 30 days | `Authorization: Bearer` on `/mcp` |
| Supabase session (JWT + rotating refresh token) | Supabase Auth | only inside the encrypted OAuth grant `props`, decrypted per request | JWT = project JWT expiry (default 60 min); refresh token is single-use | `Authorization: Bearer` on Supabase REST/RPC |

The client never sees a Supabase token, and the Worker holds no `service_role` key anywhere — every
Supabase call runs as the connected user, so a bug in the Worker can at worst hit RLS and return nothing,
never another household's rows.

The custom domain is a sibling of the app (`rezet-mcp.jarsss8.es`, not `mcp.rezet.jarsss8.es`) so it sits
under the zone's wildcard certificate with no ambiguity and shares no cookie/origin relationship with
`rezet.jarsss8.es`. If a nested subdomain is ever tried instead, expect to see a TLS/certificate error on
first visit while Cloudflare provisions an Advanced Certificate for it.

### Connecting

- **Claude.ai:** Settings → Connectors → Add custom connector → URL `https://rezet-mcp.jarsss8.es/mcp` →
  follow the sign-in prompt (consent page → Google or Apple).
- **Claude Desktop:** same connector mechanism as Claude.ai (Settings → Connectors), same URL.
- **Claude Code:** `claude mcp add --transport http rezet-remote https://rezet-mcp.jarsss8.es/mcp`, then
  `/mcp` in a session → Authenticate. This is separate from, and can be used alongside, the stdio `rezet`
  server already registered in this repo's `.mcp.json`.

### Operating it

- `npm run dev:worker` — runs `wrangler dev -c wrangler.dev.jsonc` for local testing. See "Remote server
  (`src/worker/`) — local OAuth testing" above for why the `.dev.jsonc` config (not plain `wrangler dev`
  / `wrangler.jsonc`) is required.
- `npm run deploy:worker` — `wrangler deploy`, ships `src/worker/index.ts` as the `rezet-mcp` Worker.
  Manual, like the app's own deploy — no CI/CD.
- `wrangler secret put SUPABASE_ANON_KEY` — the one secret the Worker needs (same public anon key as
  `app/.env.local`'s `VITE_SUPABASE_ANON_KEY`; kept as a secret rather than a `vars` entry defensively,
  not because it's sensitive).
- `wrangler tail` — live logs. The Worker never logs `ctx.props`, the Supabase token JSON, or request
  headers — only OAuth error codes and tool-level `PostgrestError` messages, same discipline as the stdio
  server's stderr.
- `OAUTH_KV` — the KV namespace `@cloudflare/workers-oauth-provider` uses to store registered clients,
  grants (AES-GCM-encrypted `props`), and hashed tokens. Created once with
  `npx wrangler kv namespace create OAUTH_KV`; its id goes in `wrangler.jsonc`.

### Limitations

- **No household creation from the MCP.** A signed-in user without a `profile` row lands on a "no
  household yet" page and no grant is issued — they must create or join a household in the real app
  first, then reconnect.
- **Google and Apple sign-in only, no passkey.** Passkeys are WebAuthn-bound to the Rezet app's own
  origin; they can't work through this relay.
- **One timezone for the whole deployment** (`REZET_TZ=Europe/Madrid`, set once per Worker isolate) — not
  per-user. Every connected household sees "today"/week boundaries/timers in Madrid time regardless of
  where they actually are.
