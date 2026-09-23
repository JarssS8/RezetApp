import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Objetos que existen en la plataforma Supabase pero no en un Postgres pelado.
 * Son stubs mínimos: lo justo para que las migraciones apliquen y para poder
 * probar RLS de verdad cambiando de rol con `set role`.
 */
const PRELUDE = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;

create extension if not exists pgcrypto schema extensions;

create table auth.users (id uuid primary key);

create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- auth.uid() lee una variable de sesión: cada test decide quién llama.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('rezet.test_uid', true), '')::uuid
$$;

-- En Supabase real, anon/authenticated tienen USAGE de fábrica sobre estos
-- esquemas (y EXECUTE sobre auth.uid()): las políticas RLS llaman a
-- auth.uid() como el rol que hace la consulta, no como el dueño de la
-- función. Sin este grant, todo lo que dependa de una policy revienta con
-- "permission denied for schema auth" en cuanto se hace set role.
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
  returns uuid language sql as $$ select gen_random_uuid() $$;
create view vault.decrypted_secrets as select gen_random_uuid() as id, ''::text as name, ''::text as decrypted_secret;
create function cron.schedule(job_name text, schedule text, command text)
  returns bigint language sql as $$ select 1::bigint $$;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                              headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ select 1::bigint $$;

create publication supabase_realtime;

-- Supabase concede privilegios POR DEFECTO a anon/authenticated/service_role
-- sobre cada tabla nueva del esquema public (pg_default_acl). Sin
-- replicarlo aquí, una tabla que se olvide su revoke all parecía segura en
-- el banco (el "permission denied" salía solo, porque el rol nunca tuvo el
-- grant) y era escribible por cualquiera en producción. Con esto, un test
-- que afirme que un rol no puede tocar una tabla solo pasa si la migración
-- revoca de verdad.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
`;

/**
 * Sentencias de migraciones históricas que no se pueden emular de ninguna
 * forma razonable en PGlite y que por tanto se retiran del texto antes de
 * ejecutarlo (nunca del fichero de migración en sí). Cada entrada documenta
 * por qué: en ambos casos, lo que la extensión aportaría en producción ya
 * está stubbeado a mano en el PRELUDE (cron.schedule, net.http_post), así que
 * saltarse solo el `create extension` no cambia lo que el resto de la
 * migración puede probar.
 */
const SKIP_STATEMENTS: { file: string; statement: string; reason: string }[] = [
  {
    file: '20260905150404_rezet_web_push_infra.sql',
    statement: 'create extension if not exists pg_net;',
    reason: 'pg_net no existe como extensión instalable en PGlite; net.http_post ya está stubbeado en el PRELUDE.',
  },
  {
    file: '20260905150404_rezet_web_push_infra.sql',
    statement: 'create extension if not exists pg_cron;',
    reason: 'pg_cron no existe como extensión instalable en PGlite; cron.schedule ya está stubbeado en el PRELUDE.',
  },
];

/** Aplica el prelude y todas las migraciones en orden de nombre de fichero. */
export async function applyMigrations(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PRELUDE);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    let sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const skip of SKIP_STATEMENTS) {
      if (skip.file === file) sql = sql.split(skip.statement).join('');
    }
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Migración ${file} falló: ${(err as Error).message}`);
    }
  }
  return db;
}

/** Ejecuta `fn` como el rol indicado y con `auth.uid()` fijado. */
export async function asUser(db: PGlite, uid: string, sql: string): Promise<unknown> {
  await db.exec(`set role authenticated; select set_config('rezet.test_uid', '${uid}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role;');
  }
}

/** Crea un usuario de auth y devuelve su id. */
export async function createAuthUser(db: PGlite): Promise<string> {
  const res = await db.query<{ id: string }>(
    'insert into auth.users (id) values (gen_random_uuid()) returning id',
  );
  return res.rows[0].id;
}
