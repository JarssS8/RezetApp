#!/bin/sh
# docker/entrypoint.sh — espera a Postgres, migra, siembra, arranca.
set -e
node scripts/migrate.mjs
node scripts/seed.mjs
exec node server.js
