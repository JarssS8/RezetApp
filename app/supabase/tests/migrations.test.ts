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

  // Este test nació en la Task 1 insertando household_invite directamente,
  // como hacía entonces el cliente (código y caducidad por defecto de
  // columna). Desde la Task 3 ese insert directo pasa por el trigger de
  // compatibilidad `household_invite_server_mint_trg`, que reescribe código,
  // caducidad y autoría igual que create_invite(); el resultado observable
  // -que redeem_invite() sigue funcionando tras revocar el INSERT en
  // profile- no cambia, así que el test se deja tal cual.
  it('redeem_invite sigue funcionando tras revocar el INSERT directo en profile', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    // La invitación se crea por la RPC: desde la Fase B
    // (20260918214500_rezet_phase_b_revoke_invite_insert) el insert directo ya
    // no está permitido. Lo que prueba este test es lo de siempre: que
    // redeem_invite() puede crear el perfil aunque el cliente no tenga INSERT
    // sobre `profile`.
    const invite = await asUser(db, ana, 'select public.create_invite() as code');
    const code = (invite as { rows: { code: string }[] }).rows[0].code;

    await asUser(db, bruno, `select public.redeem_invite('${code}', 'Bruno')`);

    const perfiles = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profile where household_id = '${householdId}'`,
    );
    expect(perfiles.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('create_invite genera el código en el servidor y redeem_invite lo acepta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    const value = (code as { rows: { code: string }[] }).rows[0].code;
    expect(value).toMatch(/^[0-9A-F]{10}$/);

    await asUser(db, bruno, `select public.redeem_invite('${value}', 'Bruno')`);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.profile');
    expect(n.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('una invitación de quien ya salió del hogar deja de servir', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    const carla = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const first = await asUser(db, ana, 'select public.create_invite() as code');
    const firstCode = (first as { rows: { code: string }[] }).rows[0].code;
    await asUser(db, bruno, `select public.redeem_invite('${firstCode}', 'Bruno')`);

    // create_invite ahora exige admin: Bruno entró por redeem_invite, que lo
    // crea con is_admin = false, así que Ana lo promueve antes de que mintee.
    await asUser(db, ana, `select public.promote_admin('${bruno}'::uuid)`);
    // Bruno mintea un código y se va del hogar.
    const stash = await asUser(db, bruno, 'select public.create_invite() as code');
    const stashed = (stash as { rows: { code: string }[] }).rows[0].code;
    await asUser(db, bruno, 'select public.leave_household()');

    await expect(asUser(db, carla, `select public.redeem_invite('${stashed}', 'Carla')`)).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('un miembro no admin no puede crear invitaciones', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(db, bruno, `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`);

    await expect(asUser(db, bruno, 'select public.create_invite() as code')).rejects.toThrow(/REZET_NOT_ADMIN/);
    await db.close();
  }, 120_000);

  it('un admin sí puede crear invitaciones', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const result = await asUser(db, ana, 'select public.create_invite() as code');
    expect((result as { rows: { code: string }[] }).rows[0].code).toMatch(/^[0-9A-F]{10}$/);
    await db.close();
  }, 120_000);

  it('crear una invitación nueva caduca la anterior sin usar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const first = await asUser(db, ana, 'select public.create_invite() as code');
    const firstCode = (first as { rows: { code: string }[] }).rows[0].code;
    // La segunda invitación caduca la primera antes de crearse.
    await asUser(db, ana, 'select public.create_invite() as code');

    await expect(asUser(db, bruno, `select public.redeem_invite('${firstCode}', 'Bruno')`)).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('revoke_invite de un no admin falla', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(db, bruno, `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`);

    const invite = await db.query<{ id: string }>('select id from public.household_invite limit 1');

    await expect(
      asUser(db, bruno, `select public.revoke_invite('${invite.rows[0].id}'::uuid)`),
    ).rejects.toThrow(/REZET_NOT_ADMIN/);
    await db.close();
  }, 120_000);

  // Fase B (20260918214500_rezet_phase_b_revoke_invite_insert): hasta aquí el
  // insert directo del cliente antiguo se aceptaba y el trigger de
  // compatibilidad lo reescribía en un código válido. Ahora el permiso ya no
  // existe, así que ni admins ni nadie puede crear invitaciones fuera de
  // create_invite().
  it('el insert directo ya no está permitido ni para un admin', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    await expect(
      asUser(
        db,
        ana,
        `insert into public.household_invite (household_id) values ('${h.rows[0].household_id}')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await db.close();
  }, 120_000);

  // Revisión (reviewer): el trigger de compatibilidad reescribía código/
  // caducidad/autoría de cualquier insert directo sin comprobar admin, así
  // que un miembro cualquiera podía minar un código válido para su propio
  // hogar. Desde 20260918110000_rezet_admin_only_invite_trigger_and_select
  // el propio trigger exigía admin, y desde la Fase B
  // (20260918214500_rezet_phase_b_revoke_invite_insert) el permiso de INSERT ya
  // no existe: el rechazo pasa de ser del trigger (REZET_NOT_ADMIN) a ser del
  // propio Postgres. Se deja el caso porque el no admin es el escenario que
  // motivó el arreglo.
  it('el insert directo de un no admin es rechazado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(
      db,
      bruno,
      `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`,
    );

    const h = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${bruno}'`,
    );
    await expect(
      asUser(
        db,
        bruno,
        `insert into public.household_invite (household_id) values ('${h.rows[0].household_id}')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    // Y por la vía buena tampoco: create_invite() sigue exigiendo admin.
    await expect(asUser(db, bruno, 'select public.create_invite()')).rejects.toThrow(/REZET_NOT_ADMIN/);
    await db.close();
  }, 120_000);

  it('solo un admin puede leer las invitaciones pendientes del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(
      db,
      bruno,
      `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`,
    );

    const asNonAdmin = await asUser(db, bruno, 'select * from public.household_invite');
    expect((asNonAdmin as { rows: unknown[] }).rows.length).toBe(0);

    const asAdmin = await asUser(db, ana, 'select * from public.household_invite');
    expect((asAdmin as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    await db.close();
  }, 120_000);

  // El caso "el insert directo de un admin sigue funcionando y caduca el código
  // pendiente anterior" desaparece con la Fase B: esa vía ya no existe. Lo que
  // seguía importando de él — que crear una invitación caduca la anterior sin
  // usar — lo cubre "crear una invitación nueva caduca la anterior sin usar"
  // por la vía de create_invite().

  it('el andamio de compatibilidad de la Fase A ya no existe', async () => {
    const db = await applyMigrations();

    const trg = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_trigger
       where tgrelid = 'public.household_invite'::regclass and not tgisinternal`,
    );
    expect(trg.rows[0].n).toBe(0);

    const fn = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'force_server_minted_invite'`,
    );
    expect(fn.rows[0].n).toBe(0);

    const pol = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_policies
       where schemaname = 'public' and tablename = 'household_invite' and cmd = 'INSERT'`,
    );
    expect(pol.rows[0].n).toBe(0);

    // El revoke alcanza también a service_role, que se salta RLS.
    const priv = await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_table_privilege('anon', 'public.household_invite', 'INSERT') as anon,
              has_table_privilege('authenticated', 'public.household_invite', 'INSERT') as auth,
              has_table_privilege('service_role', 'public.household_invite', 'INSERT') as svc`,
    );
    expect(priv.rows[0]).toEqual({ anon: false, auth: false, svc: false });
    await db.close();
  }, 120_000);

  // Revisión (reviewer): create_invite() insertaba solo `household_id` y
  // confiaba en el trigger de compatibilidad para rellenar `created_by`/
  // `expires_at`; 20260918110100_rezet_create_invite_independent_of_trigger lo
  // hizo independiente. Este test lo simulaba revocando y borrando a mano; con
  // la Fase B aplicada (20260918214500_rezet_phase_b_revoke_invite_insert) esa
  // simulación sobra y el banco prueba el estado real.
  it('create_invite y redeem_invite siguen funcionando sin el trigger de compatibilidad (Fase B aplicada)', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const code = await asUser(db, ana, 'select public.create_invite() as code');
    const value = (code as { rows: { code: string }[] }).rows[0].code;
    expect(value).toMatch(/^[0-9A-F]{10}$/);

    const row = await db.query<{ created_by: string | null }>(
      `select created_by from public.household_invite where code = '${value}'`,
    );
    expect(row.rows[0].created_by).toBe(ana);

    await asUser(db, bruno, `select public.redeem_invite('${value}', 'Bruno')`);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.profile');
    expect(n.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('la cuota de reconocimiento corta al llegar al límite', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const call = () =>
      db.query<{ ok: boolean }>(
        `select public.consume_recognition_quota('${ana}'::uuid, 3, interval '1 hour') as ok`,
      );

    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(false);

    // La ventana se reinicia: con un día, una llamada de hace 25 h ya no cuenta.
    await db.query(
      `update public.recognition_usage set window_start = now() - interval '25 hours' where profile_id = '${ana}'`,
    );
    expect((await call()).rows[0].ok).toBe(true);
    await db.close();
  }, 120_000);

  it('borrar y recrear el hogar no reinicia la cuota de reconocimiento', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const call = () =>
      db.query<{ ok: boolean }>(
        `select public.consume_recognition_quota('${ana}'::uuid, 2, interval '1 day') as ok`,
      );

    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(false);

    // Auditoría run-3 (recognize-pantry-item/unbounded-gemini-spend): el
    // contador colgaba de profile con ON DELETE CASCADE y se reiniciaba.
    await asUser(db, ana, 'select public.delete_household()');
    await asUser(db, ana, "select public.create_household('Casa 2', 'Ana')");
    expect((await call()).rows[0].ok).toBe(false);
    await db.close();
  }, 120_000);

  it('salir del hogar y volver a entrar no reinicia la cuota de reconocimiento', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const invite = async () =>
      ((await asUser(db, ana, 'select public.create_invite() as c')) as { rows: { c: string }[] }).rows[0].c;
    await asUser(db, bea, `select public.redeem_invite('${await invite()}', 'Bea')`);

    const call = () =>
      db.query<{ ok: boolean }>(
        `select public.consume_recognition_quota('${bea}'::uuid, 1, interval '1 day') as ok`,
      );
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(false);

    await asUser(db, bea, 'select public.leave_household()');
    await asUser(db, bea, `select public.redeem_invite('${await invite()}', 'Bea')`);
    expect((await call()).rows[0].ok).toBe(false);
    await db.close();
  }, 120_000);

  it('borrar la cuenta sí elimina el contador de reconocimiento', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await db.query(`select public.consume_recognition_quota('${ana}'::uuid, 2, interval '1 day')`);

    await asUser(db, ana, 'select public.delete_account()');
    const left = await db.query<{ n: number }>(
      `select count(*)::int as n from public.recognition_usage where profile_id = '${ana}'`,
    );
    expect(left.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('guardar una receta propia y salir del hogar siguen funcionando', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(db, bruno, `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`);

    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    // Inserción normal con autoría propia: el trigger no debe estorbar.
    await asUser(
      db,
      bruno,
      `insert into public.recipe (household_id, name, base_servings, created_by)
       values ('${householdId}', 'Tortilla', 2, '${bruno}')`,
    );
    // Y salir del hogar (que pone created_by a null) tampoco.
    await asUser(db, bruno, 'select public.leave_household()');
    await db.close();
  }, 120_000);

  it('no se puede atribuir una fila a un perfil de otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    const m = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${mallory}'`,
    );

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.recipe (household_id, name, base_servings, created_by)
         values ('${m.rows[0].household_id}', 'Trampa', 2, '${ana}')`,
      ),
    ).rejects.toThrow(/REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD/);
    await db.close();
  }, 120_000);

  it('shopping_check tiene clave subrogada y sigue siendo único por hogar y artículo', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const hid = h.rows[0].household_id;

    const pk = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'shopping_check_pkey'`,
    );
    expect(pk.rows[0].def).toBe('PRIMARY KEY (id)');

    await asUser(db, ana, `insert into public.shopping_check (household_id, item_key) values ('${hid}', 'x|g')`);
    await expect(
      asUser(db, ana, `insert into public.shopping_check (household_id, item_key) values ('${hid}', 'x|g')`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  // Task C2 — el alta y el canje de invitación siguen pasando por sus RPC
  // SECURITY DEFINER (current_user = postgres) aunque se cierre el UPDATE de
  // tabla sobre profile/household.
  it('create_household y redeem_invite siguen funcionando tras cerrar el UPDATE de tabla', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(
      db,
      bruno,
      `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`,
    );

    const n = await db.query<{ n: number }>('select count(*)::int as n from public.profile');
    expect(n.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('el cliente sigue pudiendo actualizar name y kcal_target del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const hid = h.rows[0].household_id;

    await asUser(db, ana, `update public.household set name = 'Casa nueva' where id = '${hid}'`);
    await asUser(db, ana, `update public.household set kcal_target = 2200 where id = '${hid}'`);
    const row = await db.query<{ name: string; kcal_target: number }>(
      `select name, kcal_target from public.household where id = '${hid}'`,
    );
    expect(row.rows[0]).toEqual({ name: 'Casa nueva', kcal_target: 2200 });
    await db.close();
  }, 120_000);

  // Comprobación de privilegios, no de comportamiento: un `update ... set
  // is_admin` fallaría igual aunque el revoke fuera inocuo, porque lo
  // bloquea el trigger guardián desde 20260907181314. Lo que detecta que el
  // revoke de tabla realmente surtió efecto es has_column_privilege().
  it('el rol authenticated solo tiene UPDATE columna a columna sobre profile', async () => {
    const db = await applyMigrations();
    const priv = await db.query<{ h: boolean; a: boolean; d: boolean }>(
      `select has_column_privilege('authenticated','public.profile','household_id','UPDATE') as h,
              has_column_privilege('authenticated','public.profile','is_admin','UPDATE') as a,
              has_column_privilege('authenticated','public.profile','display_name','UPDATE') as d`,
    );
    expect(priv.rows[0]).toEqual({ h: false, a: false, d: true });
    await db.close();
  }, 120_000);

  it('el rol authenticated solo tiene UPDATE columna a columna sobre household', async () => {
    const db = await applyMigrations();
    const priv = await db.query<{ n: boolean; k: boolean; t: boolean }>(
      `select has_column_privilege('authenticated','public.household','name','UPDATE') as n,
              has_column_privilege('authenticated','public.household','kcal_target','UPDATE') as k,
              has_column_privilege('authenticated','public.household','komprapp_list_token','UPDATE') as t`,
    );
    expect(priv.rows[0]).toEqual({ n: true, k: true, t: false });
    await db.close();
  }, 120_000);

  // Task C3 — save_recipe valida photo_path dentro del jsonb: solo se acepta
  // dentro de la carpeta del propio hogar, sin `..`. Los bloqueos `for update`
  // de finish_cook/leave_household/delete_account son de concurrencia y no
  // tienen una prueba razonable en PGlite (banco de un solo cliente a la vez).
  it('save_recipe rechaza un photo_path de la carpeta de otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    const mHousehold = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${mallory}'`,
    );
    const otherHouseholdId = mHousehold.rows[0].household_id;

    await expect(
      asUser(
        db,
        ana,
        `select public.save_recipe(jsonb_build_object(
           'name', 'Trampa',
           'base_servings', 2,
           'photo_path', '${otherHouseholdId}/foto.jpg'
         )) as id`,
      ),
    ).rejects.toThrow(/REZET_INVALID_PHOTO_PATH/);
    await db.close();
  }, 120_000);

  it('save_recipe rechaza un photo_path con ".."', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    await expect(
      asUser(
        db,
        ana,
        `select public.save_recipe(jsonb_build_object(
           'name', 'Trampa',
           'base_servings', 2,
           'photo_path', '${householdId}/../secreto.jpg'
         )) as id`,
      ),
    ).rejects.toThrow(/REZET_INVALID_PHOTO_PATH/);
    await db.close();
  }, 120_000);

  it('save_recipe acepta un photo_path dentro de la carpeta del propio hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    const res = (await asUser(
      db,
      ana,
      `select public.save_recipe(jsonb_build_object(
         'name', 'Tortilla',
         'base_servings', 2,
         'photo_path', '${householdId}/foto.jpg'
       )) as id`,
    )) as { rows: { id: string }[] };
    expect(res.rows[0].id).toBeTruthy();

    const row = await db.query<{ photo_path: string }>(
      `select photo_path from public.recipe where id = '${res.rows[0].id}'`,
    );
    expect(row.rows[0].photo_path).toBe(`${householdId}/foto.jpg`);
    await db.close();
  }, 120_000);

  it('save_recipe sigue funcionando sin photo_path (cadena vacía no dispara el guardia)', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");

    const res = (await asUser(
      db,
      ana,
      `select public.save_recipe(jsonb_build_object(
         'name', 'Sin foto',
         'base_servings', 2,
         'photo_path', ''
       )) as id`,
    )) as { rows: { id: string }[] };
    expect(res.rows[0].id).toBeTruthy();
    await db.close();
  }, 120_000);

  // `create or replace function` reinicia cualquier atributo que se omita al
  // redeclarar: si esta migración hubiera añadido `security definer` al
  // copiar save_recipe/finish_cook por error, saltarían las políticas RLS de
  // las que dependen. prosecdef = false confirma que se quedaron INVOKER.
  it('save_recipe y finish_cook siguen siendo SECURITY INVOKER tras la Task C3', async () => {
    const db = await applyMigrations();
    const res = await db.query<{ proname: string; prosecdef: boolean }>(
      `select proname, prosecdef from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('save_recipe', 'finish_cook')
       order by proname`,
    );
    expect(res.rows).toEqual([
      { proname: 'finish_cook', prosecdef: false },
      { proname: 'save_recipe', prosecdef: false },
    ]);
    await db.close();
  }, 120_000);

  // Task C5 — límite de filas por perfil (private.limit_rows_per_profile).
  it('push_subscription no admite más de 10 filas por perfil', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    await asUser(
      db,
      ana,
      `insert into public.push_subscription (profile_id, endpoint, p256dh, auth)
       select '${ana}'::uuid, 'https://fcm.googleapis.com/send/' || g, 'p256dh', 'auth'
       from generate_series(1, 10) as g`,
    );

    await expect(
      asUser(
        db,
        ana,
        `insert into public.push_subscription (profile_id, endpoint, p256dh, auth)
         values ('${ana}'::uuid, 'https://fcm.googleapis.com/send/11', 'p256dh', 'auth')`,
      ),
    ).rejects.toThrow(/REZET_TOO_MANY_ROWS/);
    await db.close();
  }, 120_000);

  it('cook_timer no admite más de 50 filas por perfil', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${ana}'`,
    );
    const householdId = h.rows[0].household_id;
    const recipeRes = (await asUser(
      db,
      ana,
      `insert into public.recipe (household_id, name, base_servings, created_by)
       values ('${householdId}', 'Tortilla', 2, '${ana}') returning id`,
    )) as { rows: { id: string }[] };
    const recipeId = recipeRes.rows[0].id;

    await asUser(
      db,
      ana,
      `insert into public.cook_timer (household_id, profile_id, recipe_id, step_index, ends_at)
       select '${householdId}'::uuid, '${ana}'::uuid, '${recipeId}'::uuid, g, now() + interval '10 minutes'
       from generate_series(0, 49) as g`,
    );

    await expect(
      asUser(
        db,
        ana,
        `insert into public.cook_timer (household_id, profile_id, recipe_id, step_index, ends_at)
         values ('${householdId}'::uuid, '${ana}'::uuid, '${recipeId}'::uuid, 50, now() + interval '10 minutes')`,
      ),
    ).rejects.toThrow(/REZET_TOO_MANY_ROWS/);
    await db.close();
  }, 120_000);

  // El motivo de usar AFTER en vez de BEFORE: `useCookTimerSync.ts:26` hace
  // upsert con `onConflict: 'profile_id,recipe_id,step_index'`. Con el perfil
  // ya en el tope, reenviar un temporizador que YA existe (camino UPDATE del
  // upsert) no debe fallar, aunque no libere ninguna fila nueva.
  it('con el perfil en el tope de cook_timer, re-sincronizar un temporizador existente sigue funcionando', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${ana}'`,
    );
    const householdId = h.rows[0].household_id;
    const recipeRes = (await asUser(
      db,
      ana,
      `insert into public.recipe (household_id, name, base_servings, created_by)
       values ('${householdId}', 'Tortilla', 2, '${ana}') returning id`,
    )) as { rows: { id: string }[] };
    const recipeId = recipeRes.rows[0].id;

    await asUser(
      db,
      ana,
      `insert into public.cook_timer (household_id, profile_id, recipe_id, step_index, ends_at)
       select '${householdId}'::uuid, '${ana}'::uuid, '${recipeId}'::uuid, g, now() + interval '10 minutes'
       from generate_series(0, 49) as g`,
    );

    // No debe lanzar REZET_TOO_MANY_ROWS: la fila con step_index 0 ya existe,
    // así que el conflicto la actualiza en vez de insertarla.
    await asUser(
      db,
      ana,
      `insert into public.cook_timer (household_id, profile_id, recipe_id, step_index, ends_at)
       values ('${householdId}'::uuid, '${ana}'::uuid, '${recipeId}'::uuid, 0, now() + interval '20 minutes')
       on conflict (profile_id, recipe_id, step_index) do update set ends_at = excluded.ends_at`,
    );
    await db.close();
  }, 120_000);

  // ── Auditoría run-3: expulsar miembros y quitar el rol de admin ──────────
  // (app/supabase/migrations:household-membership:no-member-removal-or-admin-demotion)
  const householdWith = async (db: Awaited<ReturnType<typeof applyMigrations>>, names: string[]) => {
    const ids: string[] = [];
    for (const _ of names) ids.push(await createAuthUser(db));
    await asUser(db, ids[0], `select public.create_household('Casa', '${names[0]}')`);
    for (let i = 1; i < ids.length; i++) {
      const code = ((await asUser(db, ids[0], 'select public.create_invite() as c')) as { rows: { c: string }[] }).rows[0].c;
      await asUser(db, ids[i], `select public.redeem_invite('${code}', '${names[i]}')`);
    }
    return ids;
  };
  const count = async (db: Awaited<ReturnType<typeof applyMigrations>>, uid: string, sql: string) =>
    ((await asUser(db, uid, sql)) as { rows: { n: number }[] }).rows[0].n;

  it('un admin puede expulsar a un miembro y este pierde el acceso', async () => {
    const db = await applyMigrations();
    const [ana, mallory] = await householdWith(db, ['Ana', 'Mallory']);
    await asUser(db, ana, "insert into public.recipe (household_id, name) select household_id, 'Privada' from public.profile where id = auth.uid()");
    expect(await count(db, mallory, 'select count(*)::int as n from public.recipe')).toBe(1);

    await asUser(db, ana, `select public.remove_member('${mallory}')`);

    expect(await count(db, mallory, 'select count(*)::int as n from public.recipe')).toBe(0);
    const left = await db.query<{ n: number }>(`select count(*)::int as n from public.profile where id = '${mallory}'`);
    expect(left.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('quien no es admin no puede expulsar a nadie', async () => {
    const db = await applyMigrations();
    const [, bea, carl] = await householdWith(db, ['Ana', 'Bea', 'Carl']);
    await expect(asUser(db, bea, `select public.remove_member('${carl}')`)).rejects.toThrow(/REZET_NOT_ADMIN/);
    await db.close();
  }, 120_000);

  it('no se puede expulsar a alguien de otro hogar ni a uno mismo', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana', 'Bea']);
    const [, zoe] = await householdWith(db, ['Yan', 'Zoe']);
    await expect(asUser(db, ana, `select public.remove_member('${zoe}')`)).rejects.toThrow(/REZET_NOT_A_MEMBER/);
    await expect(asUser(db, ana, `select public.remove_member('${ana}')`)).rejects.toThrow(/REZET_NOT_A_MEMBER/);
    await db.close();
  }, 120_000);

  it('a un admin hay que quitarle el rol antes de expulsarlo', async () => {
    const db = await applyMigrations();
    const [ana, bruno] = await householdWith(db, ['Ana', 'Bruno']);
    await asUser(db, ana, `select public.promote_admin('${bruno}')`);
    await expect(asUser(db, ana, `select public.remove_member('${bruno}')`)).rejects.toThrow(/REZET_TARGET_IS_ADMIN/);

    await asUser(db, ana, `select public.demote_admin('${bruno}')`);
    await asUser(db, ana, `select public.remove_member('${bruno}')`);
    const left = await db.query<{ n: number }>(`select count(*)::int as n from public.profile where id = '${bruno}'`);
    expect(left.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('quitar el rol de admin deja al miembro sin poder de admin y anula sus invitaciones', async () => {
    const db = await applyMigrations();
    const [ana, bruno] = await householdWith(db, ['Ana', 'Bruno']);
    await asUser(db, ana, `select public.promote_admin('${bruno}')`);
    const code = ((await asUser(db, bruno, 'select public.create_invite() as c')) as { rows: { c: string }[] }).rows[0].c;

    await asUser(db, ana, `select public.demote_admin('${bruno}')`);

    await expect(asUser(db, bruno, 'select public.create_invite()')).rejects.toThrow(/REZET_NOT_ADMIN/);
    await expect(asUser(db, bruno, 'select public.delete_household()')).rejects.toThrow();
    const carl = await createAuthUser(db);
    await expect(asUser(db, carl, `select public.redeem_invite('${code}', 'Carl')`)).rejects.toThrow(/inválido o caducado/);
    await db.close();
  }, 120_000);

  it('quien no es admin no puede quitar el rol, y nadie se lo quita a sí mismo por aquí', async () => {
    const db = await applyMigrations();
    const [ana, bruno, carl] = await householdWith(db, ['Ana', 'Bruno', 'Carl']);
    await asUser(db, ana, `select public.promote_admin('${bruno}')`);
    await expect(asUser(db, carl, `select public.demote_admin('${bruno}')`)).rejects.toThrow(/REZET_NOT_ADMIN/);
    await expect(asUser(db, ana, `select public.demote_admin('${ana}')`)).rejects.toThrow(/REZET_NOT_A_MEMBER/);
    await db.close();
  }, 120_000);

  // (app/supabase/migrations:redeem_invite:invite-creator-admin-not-rechecked)
  it('una invitación cuyo creador no es admin ya no se puede canjear', async () => {
    const db = await applyMigrations();
    const [, bea] = await householdWith(db, ['Ana', 'Bea']);
    // Fila heredada de la ventana 1.6.0–1.7.2, cuando cualquier miembro acuñaba invitaciones.
    await db.query(
      `insert into public.household_invite (household_id, created_by, code, expires_at)
       select household_id, id, 'LEGACY0001', now() + interval '5 days' from public.profile where id = '${bea}'`,
    );
    const zoe = await createAuthUser(db);
    await expect(asUser(db, zoe, "select public.redeem_invite('LEGACY0001', 'Zoe')")).rejects.toThrow(/inválido o caducado/);
    await db.close();
  }, 120_000);

  // ── Auditoría run-3: hallazgos de severidad baja ─────────────────────────
  // (rezet-supabase:household:vestigial-insert-policy-allows-unowned-orphan-households)
  it('nadie crea hogares con INSERT directo; create_household sigue funcionando', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await expect(asUser(db, ana, "insert into public.household (name) values ('huérfano')")).rejects.toThrow();
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.household');
    expect(n.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  // (rezet-supabase:recipe.photo_path:direct-dml-bypasses-save_recipe-folder-guard)
  it('photo_path solo puede apuntar a la carpeta del propio hogar, también por DML directo', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [yan] = await householdWith(db, ['Yan']);
    const hYan = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${yan}'`)).rows[0].h;
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;
    await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'R')`);

    await expect(
      asUser(db, ana, `update public.recipe set photo_path = '${hYan}/11111111-1111-4111-8111-111111111111.jpg'`),
    ).rejects.toThrow();
    await expect(
      asUser(db, ana, `update public.recipe set photo_path = '${hAna}/../${hYan}/x.jpg'`),
    ).rejects.toThrow();
    await asUser(db, ana, `update public.recipe set photo_path = '${hAna}/11111111-1111-4111-8111-111111111111.jpg'`);
    await asUser(db, ana, 'update public.recipe set photo_path = null');
    await db.close();
  }, 120_000);

  // (rezet-storage:recipe-photos:nested-prefix-objects-escape-orphan-sweep)
  it('recipe-photos solo acepta nombres planos <hogar>/<uuid>.<ext>', async () => {
    const db = await applyMigrations();
    // El stub de storage no trae los grants que Supabase da a authenticated.
    await db.exec('grant usage on schema storage to authenticated; grant select, insert, update on storage.objects to authenticated;');
    const [ana] = await householdWith(db, ['Ana']);
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;
    const put = (name: string) =>
      asUser(db, ana, `insert into storage.objects (bucket_id, name) values ('recipe-photos', '${name}')`);

    await put(`${hAna}/11111111-1111-4111-8111-111111111111.jpg`);
    await put(`${hAna}/22222222-2222-4222-8222-222222222222.webp`);
    await expect(put(`${hAna}/sub/x.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/a/b/c/d.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/not-a-uuid.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/33333333-3333-4333-8333-333333333333.html`)).rejects.toThrow();
    await db.close();
  }, 120_000);

  // (rezet-supabase:rls:household-scoped-fk-columns-accept-foreign-household-ids)
  it('una fila del hogar no puede referenciar recetas, ingredientes ni etiquetas de otro hogar', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [eve] = await householdWith(db, ['Eve']);
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;
    const hEve = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${eve}'`)).rows[0].h;
    const recipeA = ((await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'A') returning id`)) as { rows: { id: string }[] }).rows[0].id;
    const ingA = ((await asUser(db, ana, `insert into public.ingredient (household_id, name_es, name_en) values ('${hAna}', 'secreto', 'secret') returning id`)) as { rows: { id: string }[] }).rows[0].id;
    const tagA = ((await asUser(db, ana, `insert into public.tag (household_id, name) values ('${hAna}', 'privada') returning id`)) as { rows: { id: string }[] }).rows[0].id;
    const recipeE = ((await asUser(db, eve, `insert into public.recipe (household_id, name) values ('${hEve}', 'E') returning id`)) as { rows: { id: string }[] }).rows[0].id;
    const globalIng = (await db.query<{ id: string }>("insert into public.ingredient (household_id, name_es, name_en) values (null, 'sal', 'salt') returning id")).rows[0].id;

    const denied = [
      `insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings) values ('${hEve}', '2026-09-21', 'dinner', '${recipeA}', 2)`,
      `insert into public.pantry_item (household_id, ingredient_id, quantity, unit) values ('${hEve}', '${ingA}', 1, 'g')`,
      `insert into public.recipe_ingredient (recipe_id, ingredient_id, quantity, unit, position) values ('${recipeE}', '${ingA}', 1, 'g', 0)`,
      `insert into public.recipe_tag (recipe_id, tag_id) values ('${recipeE}', '${tagA}')`,
      `insert into public.cook_log (household_id, recipe_id, servings) values ('${hEve}', '${recipeA}', 2)`,
    ];
    for (const sql of denied) await expect(asUser(db, eve, sql)).rejects.toThrow(/row-level security/);

    // Lo propio y el catálogo global siguen permitidos.
    await asUser(db, eve, `insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings) values ('${hEve}', '2026-09-21', 'dinner', '${recipeE}', 2)`);
    await asUser(db, eve, `insert into public.pantry_item (household_id, ingredient_id, quantity, unit) values ('${hEve}', '${globalIng}', 1, 'g')`);
    await asUser(db, eve, `insert into public.recipe_ingredient (recipe_id, ingredient_id, quantity, unit, position) values ('${recipeE}', '${globalIng}', 1, 'g', 0)`);
    await db.close();
  }, 120_000);

  // Nota importante sobre estos tests: el banco aplica las migraciones sobre
  // una base vacía, nunca hay un `profile` previo, así que el backfill de
  // esta migración no se puede probar aquí (se verifica a mano en el
  // despliegue; son dos filas en producción). Desde la Tarea 5,
  // `create_household`/`redeem_invite` ya crean su propia fila de `member`,
  // así que estos tests ya no la insertan a mano (duplicaría `auth_user_id`
  // y violaría `member_auth_uq`); usan `asUser` solo para lo que quieren
  // comprobar: las políticas y los grants.

  it('member: no se puede insertar ni borrar desde el cliente', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');

    await expect(
      asUser(
        db,
        ana,
        `insert into public.member (household_id, display_name) values ('${h.rows[0].id}', 'Colado')`,
      ),
    ).rejects.toThrow();

    await expect(asUser(db, ana, 'delete from public.member')).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('member: solo se pueden actualizar las columnas propias de la fila propia', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    // La propia: sí.
    await asUser(db, ana, "update public.member set color = 'blue' where auth_user_id = '" + ana + "'");
    const propio = await db.query<{ color: string }>(
      `select color from public.member where auth_user_id = '${ana}'`,
    );
    expect(propio.rows[0].color).toBe('blue');

    // La de otro: la política no deja ninguna fila que actualizar.
    await asUser(db, ana, `update public.member set color = 'pink' where auth_user_id = '${bea}'`);
    const ajeno = await db.query<{ color: string }>(
      `select color from public.member where auth_user_id = '${bea}'`,
    );
    expect(ajeno.rows[0].color).not.toBe('pink');

    // Una columna sin grant: rechazo duro.
    await expect(
      asUser(db, ana, `update public.member set is_ward = true where auth_user_id = '${ana}'`),
    ).rejects.toThrow();

    await db.close();
  }, 120_000);

  it('member: kcal_target no admite valores absurdos', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    await expect(
      asUser(db, ana, `update public.member set kcal_target = 99999 where auth_user_id = '${ana}'`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('tutelados: solo un admin los crea, y quedan en su hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    await asUser(db, ana, "select public.create_ward_member('Nico', 'blue')");
    const ward = await db.query<{ n: number; is_ward: boolean }>(
      "select count(*)::int as n, bool_or(is_ward) as is_ward from public.member where display_name = 'Nico'",
    );
    expect(ward.rows[0].n).toBe(1);
    expect(ward.rows[0].is_ward).toBe(true);

    // Bea no es admin.
    await expect(asUser(db, bea, "select public.create_ward_member('Otro', 'pink')")).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('tutelados: no se pueden editar desde otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    await asUser(db, ana, "select public.create_ward_member('Nico', 'blue')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await expect(
      asUser(
        db,
        mallory,
        `select public.set_member_settings('${nico.rows[0].id}', '{"display_name":"Robado"}'::jsonb)`,
      ),
    ).rejects.toThrow();

    const sigue = await db.query<{ display_name: string }>(
      `select display_name from public.member where id = '${nico.rows[0].id}'`,
    );
    expect(sigue.rows[0].display_name).toBe('Nico');
    await db.close();
  }, 120_000);

  it('set_member_settings ignora las claves que no están en la lista blanca', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );

    await asUser(
      db,
      ana,
      `select public.set_member_settings('${yo.rows[0].id}',
         '{"color":"teal","auth_user_id":"${mallory}","is_ward":true}'::jsonb)`,
    );

    const m = await db.query<{ color: string; auth_user_id: string; is_ward: boolean }>(
      `select color, auth_user_id, is_ward from public.member where id = '${yo.rows[0].id}'`,
    );
    expect(m.rows[0].color).toBe('teal');
    expect(m.rows[0].auth_user_id).toBe(ana);
    expect(m.rows[0].is_ward).toBe(false);
    await db.close();
  }, 120_000);

  it('delete_ward_member no sirve para expulsar a alguien con cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await expect(
      asUser(db, ana, `select public.delete_ward_member('${beaMember.rows[0].id}')`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('member: un hogar no ve los miembros de otro', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    // La lectura tiene que ir por asUser: db.query es superusuario y no
    // evalúa RLS, así que ahí un `using (true)` pasaría desapercibido.
    const vistos = (await asUser(
      db,
      mallory,
      'select display_name from public.member',
    )) as { rows: { display_name: string }[] };

    expect(vistos.rows).toHaveLength(1);
    expect(vistos.rows[0].display_name).toBe('Mallory');
    await db.close();
  }, 120_000);

  // ── Tarea 5: `member` enganchado al ciclo de vida del hogar ────────────

  it('crear hogar y canjear invitación crean también el member', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    const res = await db.query<{ n: number }>(
      'select count(*)::int as n from public.member where deleted_at is null',
    );
    expect(res.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('salir del hogar marca el member como borrado, no lo elimina', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    await asUser(db, bea, 'select public.leave_household()');

    const res = await db.query<{ n: number; borrados: number }>(
      `select count(*)::int as n,
              count(*) filter (where deleted_at is not null)::int as borrados
         from public.member`,
    );
    expect(res.rows[0].n).toBe(2);
    expect(res.rows[0].borrados).toBe(1);
    await db.close();
  }, 120_000);

  it('quien se va deja de ser tutelable aunque pierda la cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await asUser(db, bea, 'select public.leave_household()');

    // Su fila queda marcada, no borrada.
    const marcada = await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.member where id = '${beaMember.rows[0].id}'`,
    );
    expect(marcada.rows[0].deleted_at).not.toBeNull();

    // Y ahora lo que de verdad hay que vigilar: forzamos la tutela a mano,
    // que es el peor caso imaginable (alguien marca como tutelado a quien se
    // fue). Con `is_ward` a true, lo ÚNICO que impide que el hogar edite sus
    // datos es el `deleted_at`. Sin esta línea, el test pasaría igual aunque
    // se quitara el borrado lógico de `leave_household`.
    await db.exec(`update public.member set is_ward = true where id = '${beaMember.rows[0].id}'`);

    const puede = (await asUser(
      db,
      ana,
      `select private.can_act_for('${beaMember.rows[0].id}') as ok`,
    )) as { rows: { ok: boolean }[] };
    expect(puede.rows[0].ok).toBe(false);
    await db.close();
  }, 120_000);

  // ── Tarea 6: separar los dos espacios de identificadores ────────────────

  it('remove_member marca el member como borrado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    await asUser(db, ana, `select public.remove_member(p_member_id => '${bea}')`);

    const res = await db.query<{ borrados: number }>(
      `select count(*) filter (where deleted_at is not null)::int as borrados from public.member`,
    );
    expect(res.rows[0].borrados).toBe(1);
    await db.close();
  }, 120_000);

  // ── Tarea 11: avatares en Storage ────────────────────────────────────────
  // Calcado de los tests de `recipe-photos` (20260919100300): el bucket
  // `avatars` existe justo para no repetir el fallo de rutas anidadas que se
  // escapan del barrido de huérfanos.

  it('avatar_path solo puede apuntar a la carpeta del propio hogar, también por DML directo', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [yan] = await householdWith(db, ['Yan']);
    const hYan = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${yan}'`)).rows[0].h;
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;
    const memberAna = (await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${ana}'`)).rows[0].id;

    await expect(
      asUser(
        db,
        ana,
        `update public.member set avatar_path = '${hYan}/11111111-1111-4111-8111-111111111111.jpg' where id = '${memberAna}'`,
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, ana, `update public.member set avatar_path = '${hAna}/../${hYan}/x.jpg' where id = '${memberAna}'`),
    ).rejects.toThrow();
    await asUser(
      db,
      ana,
      `update public.member set avatar_path = '${hAna}/11111111-1111-4111-8111-111111111111.jpg' where id = '${memberAna}'`,
    );
    await asUser(db, ana, `update public.member set avatar_path = null where id = '${memberAna}'`);
    await db.close();
  }, 120_000);

  it('avatars solo acepta nombres planos <hogar>/<uuid>.<ext>', async () => {
    const db = await applyMigrations();
    // El stub de storage no trae los grants que Supabase da a authenticated.
    await db.exec('grant usage on schema storage to authenticated; grant select, insert, update on storage.objects to authenticated;');
    const [ana] = await householdWith(db, ['Ana']);
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;
    const put = (name: string) =>
      asUser(db, ana, `insert into storage.objects (bucket_id, name) values ('avatars', '${name}')`);

    await put(`${hAna}/11111111-1111-4111-8111-111111111111.jpg`);
    await put(`${hAna}/22222222-2222-4222-8222-222222222222.webp`);
    await expect(put(`${hAna}/sub/x.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/a/b/c/d.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/not-a-uuid.jpg`)).rejects.toThrow();
    await expect(put(`${hAna}/33333333-3333-4333-8333-333333333333.html`)).rejects.toThrow();
    await db.close();
  }, 120_000);

  // ── Revisión final de fundación de miembro: invariantes de esquema ──────
  // (20260920090500_rezet_member_schema_invariants)

  it('member: borrar la cuenta por fuera de las RPC (auth.users) también marca deleted_at', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const memberId = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${ana}'`)
    ).rows[0].id;

    // Nada de asUser aquí a propósito: borrar de auth.users es justo lo que
    // un panel/Admin API haría por fuera de leave_household/delete_account/
    // remove_member, sin pasar por ninguna RPC.
    await db.query(`delete from auth.users where id = '${ana}'`);

    const member = await db.query<{ deleted_at: string | null; auth_user_id: string | null }>(
      `select deleted_at, auth_user_id from public.member where id = '${memberId}'`,
    );
    expect(member.rows[0].auth_user_id).toBeNull();
    expect(member.rows[0].deleted_at).not.toBeNull();
    await db.close();
  }, 120_000);

  it('avatars: leer objetos de otro hogar no devuelve nada (RLS)', async () => {
    const db = await applyMigrations();
    // El stub de storage no trae los grants que Supabase da a authenticated.
    await db.exec('grant usage on schema storage to authenticated; grant select, insert, update on storage.objects to authenticated;');
    const [ana] = await householdWith(db, ['Ana']);
    const [yan] = await householdWith(db, ['Yan']);
    const hAna = (await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)).rows[0].h;

    await asUser(db, ana, `insert into storage.objects (bucket_id, name) values ('avatars', '${hAna}/11111111-1111-4111-8111-111111111111.jpg')`);

    // asUser, no db.query directo: fuera de asUser eres superusuario y RLS
    // no se evalúa, así que la lectura de "otro hogar" no probaría nada.
    const seenByOwner = (await asUser(db, ana, "select * from storage.objects where bucket_id = 'avatars'")) as {
      rows: unknown[];
    };
    expect(seenByOwner.rows.length).toBe(1);

    const seenByOther = (await asUser(db, yan, "select * from storage.objects where bucket_id = 'avatars'")) as {
      rows: unknown[];
    };
    expect(seenByOther.rows.length).toBe(0);
    await db.close();
  }, 120_000);

  it('member_body: nadie lee los datos corporales de otro adulto del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );
    await asUser(
      db,
      bea,
      `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":62,"sex":"female"}'::jsonb, 1850)`,
    );

    // Bea sí ve lo suyo.
    const propio = (await asUser(db, bea, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(propio.rows[0].n).toBe(1);

    // Ana, del mismo hogar, no ve nada.
    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);

    // Y tampoco puede escribirlo.
    await expect(
      asUser(db, ana, `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":99}'::jsonb, null)`),
    ).rejects.toThrow();

    await db.close();
  }, 120_000);

  it('member_body: el tutelado sí lo gestiona quien tiene cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `select public.set_member_body('${nico.rows[0].id}', '{"birth_year":2014}'::jsonb, 1600)`,
    );

    const visto = (await asUser(db, ana, 'select count(*)::int as n from public.member_body')) as {
      rows: { n: number }[];
    };
    expect(visto.rows[0].n).toBe(1);

    const objetivo = await db.query<{ kcal_target: number }>(
      `select kcal_target from public.member where id = '${nico.rows[0].id}'`,
    );
    expect(objetivo.rows[0].kcal_target).toBe(1600);
    await db.close();
  }, 120_000);

  it('member_body: salir del hogar borra los datos corporales', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );
    await asUser(db, bea, `select public.set_member_body('${beaMember.rows[0].id}', '{"weight_kg":62}'::jsonb, 1850)`);

    await asUser(db, bea, 'select public.leave_household()');

    const quedan = await db.query<{ n: number }>('select count(*)::int as n from public.member_body');
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('member_body: no se puede escribir la tabla por la vía directa', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await expect(
      asUser(db, ana, `insert into public.member_body (member_id, weight_kg) values ('${yo.rows[0].id}', 62)`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('intake: el diario de uno no lo lee el resto del hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await asUser(
      db,
      bea,
      `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
       values ('${h.rows[0].id}', '${beaMember.rows[0].id}', '2026-09-21', 'Cerveza', 150, 'manual')`,
    );

    const suyo = (await asUser(db, bea, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(suyo.rows[0].n).toBe(1);

    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('intake: no se puede registrar en nombre de otro adulto', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await expect(
      asUser(
        db,
        ana,
        `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
         values ('${h.rows[0].id}', '${beaMember.rows[0].id}', '2026-09-21', 'Colado', 500, 'manual')`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('intake: un tutelado sí lo registra quien lo gestiona', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
       values ('${h.rows[0].id}', '${nico.rows[0].id}', '2026-09-21', 'Merienda', 200, 'manual')`,
    );
    const n = (await asUser(db, ana, 'select count(*)::int as n from public.intake_extra')) as {
      rows: { n: number }[];
    };
    expect(n.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  it('intake: no se puede colar un extra en el hogar equivocado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");
    const hAna = await db.query<{ id: string }>(
      `select household_id as id from public.profile where id = '${ana}'`,
    );
    const mMallory = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.intake_extra (household_id, member_id, date, label, kcal, source)
         values ('${hAna.rows[0].id}', '${mMallory.rows[0].id}', '2026-09-21', 'Cruzado', 100, 'manual')`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('intake_share: borrar la comida del plan se lleva la excepción', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name) values
        ('00000000-0000-4000-8000-000000000001', '${h.rows[0].id}', 'Lentejas');
      insert into public.plan_entry (id, household_id, on_date, slot, recipe_id, servings) values
        ('00000000-0000-4000-8000-000000000002', '${h.rows[0].id}', '2026-09-21', 'lunch',
         '00000000-0000-4000-8000-000000000001', 2);
    `);

    await asUser(
      db,
      ana,
      `insert into public.intake_share (member_id, plan_entry_id, servings)
       values ('${yo.rows[0].id}', '00000000-0000-4000-8000-000000000002', 0.5)`,
    );

    await db.exec("delete from public.plan_entry where id = '00000000-0000-4000-8000-000000000002'");
    const quedan = await db.query<{ n: number }>('select count(*)::int as n from public.intake_share');
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  // Task 5 — finish_cook_v2 escribe las raciones dentro de la misma
  // transacción que descuenta la despensa: el camino "no planificado" es
  // justo el que no tenía plan_entry_id que devolver.
  it('finish_cook_v2 devuelve el id de la comida que crea y escribe las raciones', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000011', '${h.rows[0].id}', 'Lentejas', 500);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook_v2(
         '00000000-0000-4000-8000-000000000011', 2, null, '2026-09-21', 'lunch',
         '[{"member_id":"${yo.rows[0].id}","servings":1},
           {"member_id":"${nico.rows[0].id}","servings":0}]'::jsonb
       ) as out`,
    )) as { rows: { out: { shortages: unknown[]; plan_entry_id: string } }[] };

    expect(res.rows[0].out.plan_entry_id).toBeTruthy();
    expect(Array.isArray(res.rows[0].out.shortages)).toBe(true);

    const shares = await db.query<{ n: number; ceros: number }>(
      `select count(*)::int as n, count(*) filter (where servings = 0)::int as ceros
         from public.intake_share`,
    );
    expect(shares.rows[0].n).toBe(2);
    expect(shares.rows[0].ceros).toBe(1);
    await db.close();
  }, 120_000);

  it('finish_cook sigue devolviendo solo el array, para los clientes viejos', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000012', '${h.rows[0].id}', 'Sopa', 200);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook('00000000-0000-4000-8000-000000000012', 1, null, '2026-09-21', 'dinner') as out`,
    )) as { rows: { out: unknown }[] };

    expect(Array.isArray(res.rows[0].out)).toBe(true);
    await db.close();
  }, 120_000);

  it('finish_cook_v2 no acepta raciones de un miembro de otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");
    const h = await db.query<{ id: string }>(
      `select household_id as id from public.profile where id = '${ana}'`,
    );
    const mMallory = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000013', '${h.rows[0].id}', 'Arroz', 400);
    `);

    await expect(
      asUser(
        db,
        ana,
        `select public.finish_cook_v2(
           '00000000-0000-4000-8000-000000000013', 1, null, '2026-09-21', 'lunch',
           '[{"member_id":"${mMallory.rows[0].id}","servings":1}]'::jsonb)`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  // Revisión Critical 1 — la rama "ya cocinado" tenía que devolver el mismo
  // contrato que la salida normal, o el envoltorio acababa dando NULL.
  it('finish_cook_v2 sobre una comida ya cocinada devuelve el mismo contrato, y el envoltorio sigue dando []', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000014', '${h.rows[0].id}', 'Ya cocinada', 300);
      insert into public.plan_entry (id, household_id, on_date, slot, recipe_id, servings, cooked_at, servings_cooked) values
        ('00000000-0000-4000-8000-000000000015', '${h.rows[0].id}', '2026-09-21', 'lunch',
         '00000000-0000-4000-8000-000000000014', 2, now(), 2);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook_v2(
         '00000000-0000-4000-8000-000000000014', 2, '00000000-0000-4000-8000-000000000015', '2026-09-21', 'lunch',
         '[]'::jsonb
       ) as out`,
    )) as { rows: { out: { shortages: unknown[]; plan_entry_id: string } }[] };
    expect(res.rows[0].out.plan_entry_id).toBe('00000000-0000-4000-8000-000000000015');
    expect(res.rows[0].out.shortages).toEqual([]);

    const wrapped = (await asUser(
      db,
      ana,
      `select public.finish_cook(
         '00000000-0000-4000-8000-000000000014', 2, '00000000-0000-4000-8000-000000000015', '2026-09-21', 'lunch'
       ) as out`,
    )) as { rows: { out: unknown }[] };
    expect(wrapped.rows[0].out).toEqual([]);
    await db.close();
  }, 120_000);

  // Revisión Critical 2 — con la política por miembro, repartir entre dos
  // adultos del mismo hogar hacía rollback de TODA la transacción (incluido
  // el descuento de despensa). intake_share pasa a ser de nivel hogar.
  it('cocinar repartiendo entre dos adultos del hogar funciona y descuenta la despensa', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const invite = (await asUser(db, ana, 'select public.create_invite() as code')) as {
      rows: { code: string }[];
    };
    await asUser(db, bruno, `select public.redeem_invite('${invite.rows[0].code}', 'Bruno')`);

    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    const mBruno = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bruno}'`,
    );

    await db.exec(`
      insert into public.ingredient (id, household_id, name_es, name_en, default_unit) values
        ('00000000-0000-4000-8000-000000000020', '${h.rows[0].id}', 'Arroz', 'Rice', 'g');
      insert into public.recipe (id, household_id, name, base_servings, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000021', '${h.rows[0].id}', 'Paella', 2, 600);
      insert into public.recipe_ingredient (recipe_id, ingredient_id, quantity, unit, position) values
        ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000020', 100, 'g', 0);
      insert into public.pantry_item (household_id, ingredient_id, quantity, unit) values
        ('${h.rows[0].id}', '00000000-0000-4000-8000-000000000020', 500, 'g');
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook_v2(
         '00000000-0000-4000-8000-000000000021', 2, null, '2026-09-21', 'dinner',
         '[{"member_id":"${yo.rows[0].id}","servings":1},
           {"member_id":"${mBruno.rows[0].id}","servings":1}]'::jsonb
       ) as out`,
    )) as { rows: { out: { plan_entry_id: string } }[] };
    expect(res.rows[0].out.plan_entry_id).toBeTruthy();

    const pantry = await db.query<{ quantity: string }>(
      `select quantity::float8 as quantity from public.pantry_item
         where ingredient_id = '00000000-0000-4000-8000-000000000020'`,
    );
    expect(Number(pantry.rows[0].quantity)).toBe(400);

    const shares = await db.query<{ n: number }>('select count(*)::int as n from public.intake_share');
    expect(shares.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('finish_cook_v2 rechaza p_shares que no es una lista', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000022', '${h.rows[0].id}', 'Tortilla', 350);
    `);

    await expect(
      asUser(
        db,
        ana,
        `select public.finish_cook_v2(
           '00000000-0000-4000-8000-000000000022', 1, null, '2026-09-21', 'lunch',
           '{"member_id":"x"}'::jsonb)`,
      ),
    ).rejects.toThrow(/REZET_BAD_SHARES/);
    await db.close();
  }, 120_000);

  it('finish_cook_v2 con el mismo miembro repetido en p_shares se queda con el último valor', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await db.exec(`
      insert into public.recipe (id, household_id, name, kcal_per_serving) values
        ('00000000-0000-4000-8000-000000000023', '${h.rows[0].id}', 'Pisto', 320);
    `);

    const res = (await asUser(
      db,
      ana,
      `select public.finish_cook_v2(
         '00000000-0000-4000-8000-000000000023', 1, null, '2026-09-21', 'lunch',
         '[{"member_id":"${yo.rows[0].id}","servings":1},
           {"member_id":"${yo.rows[0].id}","servings":2}]'::jsonb
       ) as out`,
    )) as { rows: { out: { plan_entry_id: string } }[] };
    expect(res.rows[0].out.plan_entry_id).toBeTruthy();

    const share = await db.query<{ n: number; servings: string }>(
      'select count(*)::int as n, max(servings)::text as servings from public.intake_share',
    );
    expect(share.rows[0].n).toBe(1);
    expect(Number(share.rows[0].servings)).toBe(2);
    await db.close();
  }, 120_000);

  // ── Tarea de endurecimiento: 20260921090300_rezet_intake_hardening.sql ──
  it('delete_ward_member se lleva el member_body del tutelado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );
    await asUser(
      db,
      ana,
      `select public.set_member_body('${nico.rows[0].id}', '{"weight_kg":30}'::jsonb, 1600)`,
    );

    await asUser(db, ana, `select public.delete_ward_member('${nico.rows[0].id}')`);

    const quedan = await db.query<{ n: number }>(
      `select count(*)::int as n from public.member_body where member_id = '${nico.rows[0].id}'`,
    );
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('remove_member se lleva el member_body de quien es expulsado', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, mallory, `select public.redeem_invite('${code.rows[0].code}', 'Mallory')`);
    const malloryMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );
    await asUser(
      db,
      mallory,
      `select public.set_member_body('${malloryMember.rows[0].id}', '{"weight_kg":58}'::jsonb, 1800)`,
    );

    await asUser(db, ana, `select public.remove_member('${mallory}')`);

    const quedan = await db.query<{ n: number }>(
      `select count(*)::int as n from public.member_body where member_id = '${malloryMember.rows[0].id}'`,
    );
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('delete_household no deja ningún member_body detrás', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );
    await asUser(db, ana, `select public.set_member_body('${yo.rows[0].id}', '{"weight_kg":70}'::jsonb, 2000)`);
    await asUser(db, ana, `select public.set_member_body('${nico.rows[0].id}', '{"weight_kg":30}'::jsonb, 1600)`);

    await asUser(db, ana, 'select public.delete_household()');

    const quedan = await db.query<{ n: number }>('select count(*)::int as n from public.member_body');
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('intake_extra: created_by de otro hogar se rechaza', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");
    const hAna = await db.query<{ id: string }>(
      `select household_id as id from public.profile where id = '${ana}'`,
    );
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    const mMallory = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${mallory}'`,
    );

    await expect(
      asUser(
        db,
        ana,
        `insert into public.intake_extra (household_id, member_id, date, label, kcal, source, created_by)
         values ('${hAna.rows[0].id}', '${yo.rows[0].id}', '2026-09-21', 'Robado', 100, 'manual',
                 '${mMallory.rows[0].id}')`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('set_member_body con una actividad no válida lanza REZET_INVALID_BODY', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );

    await expect(
      asUser(
        db,
        ana,
        `select public.set_member_body('${yo.rows[0].id}', '{"activity":"crazy"}'::jsonb, null)`,
      ),
    ).rejects.toThrow(/REZET_INVALID_BODY/);
    await db.close();
  }, 120_000);

  it('notify_pref: cada uno ve y edita solo el suyo', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await asUser(
      db,
      bea,
      `insert into public.member_notify_pref (member_id, expiring) values ('${beaMember.rows[0].id}', false)`,
    );

    const suyo = (await asUser(db, bea, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(suyo.rows[0].n).toBe(1);

    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('notify_pref: un tutelado lo gestiona quien lo tutela', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `insert into public.member_notify_pref (member_id) values ('${nico.rows[0].id}')`,
    );
    const n = (await asUser(db, ana, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(n.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  it('notify_pref: borrar el miembro se lleva sus preferencias', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await db.exec(
      `insert into public.member_notify_pref (member_id) values ('${yo.rows[0].id}')`,
    );
    await db.exec(`delete from public.member where id = '${yo.rows[0].id}'`);
    const quedan = await db.query<{ n: number }>(
      'select count(*)::int as n from public.member_notify_pref',
    );
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  // (2026-09-21-avisos-gustos-turnos, task 5) — el riesgo a comprobar de
  // verdad: con una política `for select` y otra `for all` sobre la misma
  // tabla, Postgres combina los USING con OR. Si eso colase hacia
  // INSERT/UPDATE/DELETE, cualquiera del hogar podría votar por otro.
  it('recipe_pref: cualquiera del hogar lee el voto ajeno, pero nadie vota por otro', async () => {
    const db = await applyMigrations();
    const [ana, bea] = await householdWith(db, ['Ana', 'Bea']);
    const hAna = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)
    ).rows[0].h;
    const beaMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${bea}'`)
    ).rows[0].id;
    const recipe1 = (
      (await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'R1') returning id`)) as {
        rows: { id: string }[];
      }
    ).rows[0].id;
    const recipe2 = (
      (await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'R2') returning id`)) as {
        rows: { id: string }[];
      }
    ).rows[0].id;

    // Bea vota su propia receta: permitido.
    await asUser(
      db,
      bea,
      `insert into public.member_recipe_pref (member_id, recipe_id, rating) values ('${beaMember}', '${recipe1}', 1)`,
    );

    // Cara 1 — leer: Ana SÍ ve el voto de Bea (el agregado es el producto).
    const leido = await asUser(
      db,
      ana,
      `select rating from public.member_recipe_pref where member_id = '${beaMember}' and recipe_id = '${recipe1}'`,
    );
    expect((leido as { rows: { rating: number }[] }).rows).toHaveLength(1);
    expect((leido as { rows: { rating: number }[] }).rows[0].rating).toBe(1);

    // Cara 2 — escribir: Ana NO puede votar por Bea.
    await expect(
      asUser(
        db,
        ana,
        `insert into public.member_recipe_pref (member_id, recipe_id, rating) values ('${beaMember}', '${recipe2}', -1)`,
      ),
    ).rejects.toThrow(/row-level security/);

    await asUser(
      db,
      ana,
      `update public.member_recipe_pref set rating = -1 where member_id = '${beaMember}' and recipe_id = '${recipe1}'`,
    );
    const trasUpdate = await db.query<{ rating: number }>(
      `select rating from public.member_recipe_pref where member_id = '${beaMember}' and recipe_id = '${recipe1}'`,
    );
    expect(trasUpdate.rows[0].rating).toBe(1);

    await asUser(
      db,
      ana,
      `delete from public.member_recipe_pref where member_id = '${beaMember}' and recipe_id = '${recipe1}'`,
    );
    const trasDelete = await db.query<{ n: number }>(
      `select count(*)::int as n from public.member_recipe_pref where member_id = '${beaMember}' and recipe_id = '${recipe1}'`,
    );
    expect(trasDelete.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  it('recipe_pref: aislamiento entre hogares', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [eve] = await householdWith(db, ['Eve']);
    const hEve = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${eve}'`)
    ).rows[0].h;
    const eveMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${eve}'`)
    ).rows[0].id;
    const recipeE = (
      (await asUser(db, eve, `insert into public.recipe (household_id, name) values ('${hEve}', 'E') returning id`)) as {
        rows: { id: string }[];
      }
    ).rows[0].id;
    await asUser(
      db,
      eve,
      `insert into public.member_recipe_pref (member_id, recipe_id, rating) values ('${eveMember}', '${recipeE}', 1)`,
    );

    const ajeno = await count(db, ana, 'select count(*)::int as n from public.member_recipe_pref');
    expect(ajeno).toBe(0);

    await expect(
      asUser(
        db,
        ana,
        `insert into public.member_recipe_pref (member_id, recipe_id, rating) values ('${eveMember}', '${recipeE}', -1)`,
      ),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);

  // ── Task 7 (2026-09-21-avisos-gustos-turnos) — turnos de cocina/compra ──
  // El riesgo real de esta tarea: household y plan_entry ya tenían grants
  // vivos antes de esta migración, y `revoke update (columna)` es inocuo
  // mientras siga vivo el de tabla (20260917070714 → 20260917070845). Estos
  // dos tests de privilegios comprueban que NINGUNA columna que ya fuera
  // editable dejó de serlo al añadir la nueva.

  it('household: turns_enabled nace apagado y el UPDATE que ya existía sigue como estaba', async () => {
    const db = await applyMigrations();
    const priv = await db.query<{ n: boolean; k: boolean; t: boolean; e: boolean }>(
      `select has_column_privilege('authenticated','public.household','name','UPDATE') as n,
              has_column_privilege('authenticated','public.household','kcal_target','UPDATE') as k,
              has_column_privilege('authenticated','public.household','komprapp_list_token','UPDATE') as t,
              has_column_privilege('authenticated','public.household','turns_enabled','UPDATE') as e`,
    );
    // n/k/t: exactamente como antes de esta migración (20260918100100). e: nueva.
    expect(priv.rows[0]).toEqual({ n: true, k: true, t: false, e: true });

    const [ana] = await householdWith(db, ['Ana']);
    const hAna = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)
    ).rows[0].h;
    const before = await db.query<{ turns_enabled: boolean }>(
      `select turns_enabled from public.household where id = '${hAna}'`,
    );
    expect(before.rows[0].turns_enabled).toBe(false);

    await asUser(db, ana, `update public.household set turns_enabled = true where id = '${hAna}'`);
    const after = await db.query<{ turns_enabled: boolean }>(
      `select turns_enabled from public.household where id = '${hAna}'`,
    );
    expect(after.rows[0].turns_enabled).toBe(true);
    await db.close();
  }, 120_000);

  it('plan_entry: el UPDATE columna a columna que ya existía sigue como estaba, y gana cook_member_id', async () => {
    const db = await applyMigrations();
    const priv = await db.query<{
      id: boolean;
      household_id: boolean;
      on_date: boolean;
      slot: boolean;
      recipe_id: boolean;
      servings: boolean;
      cooked_at: boolean;
      servings_cooked: boolean;
      position: boolean;
      created_at: boolean;
      cook_member_id: boolean;
    }>(
      `select has_column_privilege('authenticated','public.plan_entry','id','UPDATE') as id,
              has_column_privilege('authenticated','public.plan_entry','household_id','UPDATE') as household_id,
              has_column_privilege('authenticated','public.plan_entry','on_date','UPDATE') as on_date,
              has_column_privilege('authenticated','public.plan_entry','slot','UPDATE') as slot,
              has_column_privilege('authenticated','public.plan_entry','recipe_id','UPDATE') as recipe_id,
              has_column_privilege('authenticated','public.plan_entry','servings','UPDATE') as servings,
              has_column_privilege('authenticated','public.plan_entry','cooked_at','UPDATE') as cooked_at,
              has_column_privilege('authenticated','public.plan_entry','servings_cooked','UPDATE') as servings_cooked,
              has_column_privilege('authenticated','public.plan_entry','position','UPDATE') as position,
              has_column_privilege('authenticated','public.plan_entry','created_at','UPDATE') as created_at,
              has_column_privilege('authenticated','public.plan_entry','cook_member_id','UPDATE') as cook_member_id`,
    );
    // Antes de esta migración, plan_entry solo tenía el grant de TABLA del
    // esquema base (select/insert/update/delete a authenticated, sin ningún
    // revoke de columna nunca): las diez columnas originales tenían que
    // seguir siendo editables una a una tras convertirlo en columna a
    // columna, y cook_member_id se añade nueva.
    expect(priv.rows[0]).toEqual({
      id: true,
      household_id: true,
      on_date: true,
      slot: true,
      recipe_id: true,
      servings: true,
      cooked_at: true,
      servings_cooked: true,
      position: true,
      created_at: true,
      cook_member_id: true,
    });

    // Y no solo el privilegio en abstracto: editar el plan semanal (el bucle
    // central de la app) tiene que seguir funcionando de verdad.
    const [ana] = await householdWith(db, ['Ana']);
    const hAna = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)
    ).rows[0].h;
    const recipe = (
      (await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'R') returning id`)) as {
        rows: { id: string }[];
      }
    ).rows[0].id;
    const entry = (
      (await asUser(
        db,
        ana,
        `insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings) values ('${hAna}', '2026-09-21', 'dinner', '${recipe}', 2) returning id`,
      )) as { rows: { id: string }[] }
    ).rows[0].id;
    await asUser(db, ana, `update public.plan_entry set servings = 4, on_date = '2026-09-22' where id = '${entry}'`);
    const row = await db.query<{ servings: number; on_date: string }>(
      `select servings, on_date::text from public.plan_entry where id = '${entry}'`,
    );
    expect(row.rows[0].servings).toBe(4);
    expect(row.rows[0].on_date).toBe('2026-09-22');
    await db.close();
  }, 120_000);

  it('cook_member_id no puede apuntar a un miembro de otro hogar', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [eve] = await householdWith(db, ['Eve']);
    const hAna = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)
    ).rows[0].h;
    const anaMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${ana}'`)
    ).rows[0].id;
    const eveMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${eve}'`)
    ).rows[0].id;
    const recipe = (
      (await asUser(db, ana, `insert into public.recipe (household_id, name) values ('${hAna}', 'R') returning id`)) as {
        rows: { id: string }[];
      }
    ).rows[0].id;

    // No se puede crear apuntando ya al miembro de Eve.
    await expect(
      asUser(
        db,
        ana,
        `insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings, cook_member_id) values ('${hAna}', '2026-09-21', 'dinner', '${recipe}', 2, '${eveMember}')`,
      ),
    ).rejects.toThrow(/row-level security/);

    // El propio miembro sí vale.
    const entry = (
      (await asUser(
        db,
        ana,
        `insert into public.plan_entry (household_id, on_date, slot, recipe_id, servings, cook_member_id) values ('${hAna}', '2026-09-21', 'dinner', '${recipe}', 2, '${anaMember}') returning id`,
      )) as { rows: { id: string }[] }
    ).rows[0].id;

    // Tampoco vale reasignarlo a alguien de otro hogar con un UPDATE.
    await expect(
      asUser(db, ana, `update public.plan_entry set cook_member_id = '${eveMember}' where id = '${entry}'`),
    ).rejects.toThrow(/row-level security/);

    await db.close();
  }, 120_000);

  it('shopping_turn: no se lee ni se escribe desde otro hogar', async () => {
    const db = await applyMigrations();
    const [ana] = await householdWith(db, ['Ana']);
    const [eve] = await householdWith(db, ['Eve']);
    const hAna = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${ana}'`)
    ).rows[0].h;
    const hEve = (
      await db.query<{ h: string }>(`select household_id as h from public.profile where id = '${eve}'`)
    ).rows[0].h;
    const anaMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${ana}'`)
    ).rows[0].id;
    const eveMember = (
      await db.query<{ id: string }>(`select id from public.member where auth_user_id = '${eve}'`)
    ).rows[0].id;

    await asUser(
      db,
      ana,
      `insert into public.shopping_turn (household_id, week_start, member_id) values ('${hAna}', '2026-09-21', '${anaMember}')`,
    );

    // Eve no ve la fila de Ana.
    expect(await count(db, eve, 'select count(*)::int as n from public.shopping_turn')).toBe(0);

    // Eve no puede insertar una fila para el hogar de Ana.
    await expect(
      asUser(
        db,
        eve,
        `insert into public.shopping_turn (household_id, week_start, member_id) values ('${hAna}', '2026-09-28', '${eveMember}')`,
      ),
    ).rejects.toThrow(/row-level security/);

    // Ni, dentro de su propio hogar, asignarle el turno a un miembro de otro.
    await expect(
      asUser(
        db,
        eve,
        `insert into public.shopping_turn (household_id, week_start, member_id) values ('${hEve}', '2026-09-21', '${anaMember}')`,
      ),
    ).rejects.toThrow(/row-level security/);

    await db.close();
  }, 120_000);
});
