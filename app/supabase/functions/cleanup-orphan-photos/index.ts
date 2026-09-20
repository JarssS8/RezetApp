import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { listTree, readAllByKey, referencedPaths } from "./logic.ts";

/**
 * Diseño §3.4 (segunda mitad) y §5.4 — barrido diario de dos buckets: borra
 * lo que ya no referencia ninguna fila.
 *   - `recipe-photos`, contrastado contra `recipe.photo_path`.
 *   - `avatars` (Tarea 11), contrastado contra `member.avatar_path`.
 * El borrado en el cliente (Fase A) cubre lo que se borre a partir de ahora;
 * esto limpia lo viejo y lo que dejan los borrados de hogar/cuenta, que desde
 * SQL no pueden tocar Storage.
 *
 * Las dos pasadas son exactamente la misma lógica — solo cambian la tabla, la
 * columna y el bucket — así que viven en `sweepBucket`, llamada una vez por
 * bucket en vez de duplicado: dos copias del mismo código habrían acabado
 * divergiendo (una arregla un bug de paginación y la otra no, por ejemplo).
 *
 * Solo la llama el cron (`cleanup-orphan-photos-daily`, migración
 * rezet_cleanup_orphan_photos_cron). Como `send-timer-notifications`, la
 * autenticación **falla cerrado**: la publishable key que llega hasta aquí
 * viaja en el bundle del cliente, así que cualquiera podría invocarla sin
 * `TIMER_CRON_SECRET`.
 */

const LIST_PAGE_SIZE = 100; // storage.list() no admite más de 100 por llamada
const TABLE_PAGE_SIZE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // margen para una subida en curso que aún no se ha guardado en su tabla
const REMOVE_BATCH = 100;

interface SweepTarget {
  bucket: string;
  table: string;
  pathColumn: "photo_path" | "avatar_path";
  /**
   * Corta con error si el bucket tiene objetos pero el conjunto de
   * referencias vino vacío (ver la salvaguarda de más abajo). Tiene sentido
   * para `recipe-photos`: toda receta debería acabar con foto tarde o
   * temprano, así que "cero referencias con objetos en el bucket" huele a
   * fallo (RLS, consulta rota…). No tiene sentido para `avatars`: casi nadie
   * sube uno, así que "un huérfano suelto y ningún miembro con avatar_path"
   * es el caso normal (alguien subió una foto y luego la quitó), no un
   * fallo. Exigirlo ahí dejaba el cron en rojo para siempre y los avatares
   * huérfanos sin barrer — justo lo contrario de para lo que existe esta
   * función.
   */
  requireNonEmptyReferences: boolean;
}

// El orden importa poco (cada pasada es independiente), pero se listan en el
// orden en que se añadieron: `recipe-photos` ya existía, `avatars` es de la
// Tarea 11.
const TARGETS: SweepTarget[] = [
  { bucket: "recipe-photos", table: "recipe", pathColumn: "photo_path", requireNonEmptyReferences: true },
  { bucket: "avatars", table: "member", pathColumn: "avatar_path", requireNonEmptyReferences: false },
];

type SweepResult =
  | { ok: true; checked: number; acted: number }
  | { ok: false; error: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Barre un bucket contra la tabla/columna que lo referencia. `dryRun` cuenta
 * sin borrar; sin él, borra de verdad. `acted` es `wouldDelete` en dry run o
 * `deleted` fuera de él — quien llama pone el nombre correcto en la
 * respuesta final.
 *
 * `member` se lee entero, sin filtrar por `deleted_at`: un miembro borrado
 * sigue existiendo para la atribución del historial (regla del contrato
 * `Store`), y `recipe.photo_path` tampoco se filtra por ningún equivalente —
 * misma paridad de comportamiento entre las dos tablas, a propósito, para no
 * introducir aquí una regla de borrado de avatares que nadie ha pedido.
 */
async function sweepBucket(
  supabase: SupabaseClient,
  { bucket, table, pathColumn, requireNonEmptyReferences }: SweepTarget,
  dryRun: boolean,
): Promise<SweepResult> {
  // 1) Recuento exacto de referencias vigentes, con el mismo filtro que la
  // lectura paginada de abajo, para poder comprobar después que ninguna
  // página se saltó una fila.
  const { count: expectedCount, error: countError } = await supabase
    .from(table)
    .select(pathColumn, { count: "exact", head: true })
    .not(pathColumn, "is", null);
  if (countError || expectedCount === null) {
    console.error(`cleanup-orphan-photos: failed to count ${table}.${pathColumn}`);
    return { ok: false, error: `failed to count ${table}.${pathColumn}` };
  }

  // 2) Referencias vigentes: los valores no nulos de la columna, leídos con
  // cursor por `id` (no OFFSET: con OFFSET, mover filas de lado entre dos
  // páginas desplazaba el resto y se saltaban referencias vivas de otros
  // hogares). Luego se cuentan las filas leídas contra el recuento exacto de
  // arriba: si no coinciden (alguien escribió durante el barrido), se aborta
  // sin borrar nada. Cualquier fallo de página también aborta sin borrar.
  let rows: { id: string; household_id: string; photo_path?: string | null; avatar_path?: string | null }[];
  try {
    rows = await readAllByKey(async (afterId) => {
      let query = supabase
        .from(table)
        .select(`id, household_id, ${pathColumn}`)
        .not(pathColumn, "is", null)
        .order("id")
        .limit(TABLE_PAGE_SIZE);
      if (afterId !== null) query = query.gt("id", afterId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }, TABLE_PAGE_SIZE);
  } catch {
    console.error(`cleanup-orphan-photos: failed to read ${table}.${pathColumn}`);
    return { ok: false, error: `failed to read ${table}.${pathColumn}` };
  }

  if (rows.length !== expectedCount) {
    console.error(`cleanup-orphan-photos: paginated row count does not match exact count for ${table}, aborting`);
    return { ok: false, error: "reference count mismatch" };
  }

  // Solo cuentan las rutas dentro de la carpeta del hogar de cada fila: una
  // receta (o un miembro) no puede mantener viva la foto de otro hogar.
  // `referencedPaths` ya ignora null y cadena vacía, así que un
  // `avatar_path` sin poner nunca cuenta como "en uso".
  const referenced = referencedPaths(rows, pathColumn);

  // 3) Objetos del bucket, a cualquier profundidad bajo cada carpeta de hogar
  // (las subcarpetas ya no se pueden crear, pero las antiguas también se
  // barren). `list()` devuelve como mucho 100 entradas por llamada.
  const objects = await listTree(async (path, offset) => {
    const { data, error } = await supabase.storage.from(bucket).list(path, { limit: LIST_PAGE_SIZE, offset });
    return error ? null : (data ?? []);
  }, LIST_PAGE_SIZE);
  if (objects === null) {
    console.error(`cleanup-orphan-photos: failed to list bucket ${bucket}`);
    return { ok: false, error: `failed to list bucket ${bucket}` };
  }

  // Salvaguarda final, solo para los buckets que la piden (ver el campo en
  // `SweepTarget`): si el bucket tiene objetos pero el conjunto de
  // referencias vino vacío, algo fue mal (RLS, consulta rota…) — abortar sin
  // borrar en vez de arriesgarse a vaciar el bucket entero por error.
  if (requireNonEmptyReferences && objects.length > 0 && referenced.size === 0) {
    console.error(`cleanup-orphan-photos: empty reference set with non-empty bucket ${bucket}, aborting`);
    return { ok: false, error: "empty reference set" };
  }

  const now = Date.now();
  const orphans = objects.filter((o) => {
    if (referenced.has(o.path)) return false;
    if (!o.createdAt) return false; // sin fecha no se puede confirmar el margen de 24h: no se borra
    return now - new Date(o.createdAt).getTime() > MIN_AGE_MS;
  });

  if (dryRun) {
    // Única forma de comprobar esta función antes de que el cron borre de
    // verdad: cuenta sin tocar nada.
    return { ok: true, checked: objects.length, acted: orphans.length };
  }

  let deleted = 0;
  for (let i = 0; i < orphans.length; i += REMOVE_BATCH) {
    const batch = orphans.slice(i, i + REMOVE_BATCH).map((o) => o.path);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      // Sin volcar las rutas del lote: no hay que registrar rutas completas.
      console.error(`cleanup-orphan-photos: failed to delete a batch from ${bucket}`);
      continue;
    }
    deleted += batch.length;
  }

  return { ok: true, checked: objects.length, acted: deleted };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("TIMER_CRON_SECRET");
  if (!cronSecret) {
    console.warn("cleanup-orphan-photos: TIMER_CRON_SECRET sin configurar, se rechaza");
    return json({ error: "not configured" }, 503);
  }
  if (req.headers.get("x-rezet-cron") !== cronSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Cada bucket es independiente: si uno falla, se aborta sin tocar el resto
  // de la respuesta (los buckets ya barridos antes del fallo pueden haber
  // borrado de verdad — son operaciones ya validadas y completas por sí
  // solas — pero el que falló, y los que quedan por barrer, no borran nada).
  const buckets: Record<string, { checked: number; deleted: number } | { checked: number; wouldDelete: number }> = {};
  for (const target of TARGETS) {
    const result = await sweepBucket(supabase, target, dryRun);
    if (!result.ok) {
      return json({ error: result.error, bucket: target.bucket }, 500);
    }
    buckets[target.bucket] = dryRun
      ? { checked: result.checked, wouldDelete: result.acted }
      : { checked: result.checked, deleted: result.acted };
  }

  return json(dryRun ? { dryRun: true, ...buckets } : buckets);
});
