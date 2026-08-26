import { is } from 'drizzle-orm'
import { PgDatabase } from 'drizzle-orm/pg-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/db'

// `db` usa DATABASE_URL (no DATABASE_URL_TEST); en el proyecto "db" de vitest
// solo se inyecta DATABASE_URL_TEST, así que la reutilizamos para no depender
// de una DATABASE_URL de desarrollo/producción durante los tests. `db` es un
// proxy perezoso: importarlo no toca `process.env`, así que basta con fijarla
// antes del primer acceso a una propiedad dentro del test.
beforeAll(() => {
  if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL ??= process.env.DATABASE_URL_TEST
})

describe.skipIf(!process.env.DATABASE_URL_TEST)('db (proxy perezoso)', () => {
  it('el proxy delega el prototipo real: is(db, PgDatabase)', () => {
    expect(is(db, PgDatabase)).toBe(true)
  })
})
