// scripts/seed.ts — idempotente. W1(a) añade unit_aliases, tags y foods.
import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')
const pool = new Pool({ connectionString: url })
await pool.query('select 1')
await pool.end()
console.log('seed: nada que sembrar todavía')
