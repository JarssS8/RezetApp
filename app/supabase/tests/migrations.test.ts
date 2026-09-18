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
});
