#!/bin/sh
# docker/entrypoint.sh — arregla permisos de uploads, migra, siembra, arranca.
# Espera a Postgres: la delega compose (depends_on: service_healthy) y su
# política de reinicio; este script no espera activamente.
set -e
mkdir -p /app/data/uploads && chown -R app:app /app/data/uploads
exec su-exec app sh -c 'node scripts/migrate.mjs && node scripts/seed.mjs && exec node server.js'
