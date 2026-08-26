FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

FROM node:24-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/db/migrations
# node:24-alpine ya trae un usuario/grupo "node" en uid/gid 1000 (deluser se
# lleva también su grupo); lo quitamos para poder reservar ese uid explícito
# a "app" (permisos consistentes con el host en ./data/uploads).
RUN apk add --no-cache libc6-compat su-exec \
  && deluser node \
  && addgroup -g 1000 -S app \
  && adduser -u 1000 -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist/scripts ./scripts
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /app/data/uploads && chown app:app /app/data/uploads
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
