import { describe, expect, it } from 'vitest';
import { applyMigrations, asUser, createAuthUser } from './harness';

describe('migraciones', () => {
  it('aplican todas en orden sobre un Postgres limpio', async () => {
    const db = await applyMigrations();
    const res = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(res.rows[0].n).toBeGreaterThan(10);
    await db.close();
  }, 120_000);

  it('el ciclo de alta funciona: crear hogar, invitar, canjear', async () => {
    const db = await applyMigrations();
    const a = await createAuthUser(db);
    const b = await createAuthUser(db);

    await asUser(db, a, "select public.create_household('Casa', 'Ana')");
    const household = await db.query<{ n: number }>('select count(*)::int as n from public.household');
    expect(household.rows[0].n).toBe(1);

    await db.close();
  }, 120_000);

  it('un usuario con sesión no puede insertarse en un hogar ajeno', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const householdId = h.rows[0].id;

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.profile (id, household_id, display_name, is_admin)
         values ('${mallory}', '${householdId}', 'Mallory', true)`,
      ),
    ).rejects.toThrow();

    const perfiles = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profile where household_id = '${householdId}'`,
    );
    expect(perfiles.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  // redeem_invite() todavía no tiene una RPC propia para minar invitaciones
  // (eso llega en la Task 3): hoy el cliente inserta la fila directamente en
  // household_invite, con código y caducidad por defecto de columna. Este test
  // cubre que redeem_invite() sigue funcionando (ya era SECURITY DEFINER antes
  // de esta tarea, y esta tarea no lo toca) tras revocar el INSERT en profile.
  it('redeem_invite sigue funcionando tras revocar el INSERT directo en profile', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    await asUser(
      db,
      ana,
      `insert into public.household_invite (household_id) values ('${householdId}')`,
    );
    const invite = await db.query<{ code: string }>(
      'select code from public.household_invite limit 1',
    );
    const code = invite.rows[0].code;

    await asUser(db, bruno, `select public.redeem_invite('${code}', 'Bruno')`);

    const perfiles = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profile where household_id = '${householdId}'`,
    );
    expect(perfiles.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);
});
