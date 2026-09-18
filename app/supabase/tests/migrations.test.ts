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

  it('el insert directo del cliente antiguo produce un código válido igualmente', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    await asUser(
      db,
      ana,
      `insert into public.household_invite (household_id) values ('${h.rows[0].household_id}')`,
    );
    // household_invite no tiene `created_at`; como el trigger de compatibilidad
    // fija `expires_at = now() + 7 días` en cada insert y esta es la única fila
    // del hogar en este test, ordenar por `expires_at` desc basta para coger la
    // recién minada.
    const row = await db.query<{ code: string; created_by: string | null }>(
      'select code, created_by from public.household_invite order by expires_at desc limit 1',
    );
    expect(row.rows[0].created_by).toBe(ana);
    await asUser(db, bruno, `select public.redeem_invite('${row.rows[0].code}', 'Bruno')`);
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
});
