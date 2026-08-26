import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://rezetapp:rezetapp@localhost:5432/rezetapp' },
  strict: true,
  verbose: true,
})
