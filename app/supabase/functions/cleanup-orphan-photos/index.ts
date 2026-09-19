import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { listTree, readAllByKey, referencedPaths } from "./logic.ts";

/**
 * Diseño §3.4 (segunda mitad) — barrido diario del bucket `recipe-photos`:
 * borra lo que ya no referencia ninguna receta. El borrado en el cliente
 * (Fase A) cubre lo que se borre a partir de ahora; esto limpia lo viejo y
 * lo que dejan los borrados de hogar/cuenta, que desde SQL no pueden tocar
 * Storage.
 *
 * Solo la llama el cron (`cleanup-orphan-photos-daily`, migración
 * rezet_cleanup_orphan_photos_cron). Como `send-timer-notifications`, la
 * autenticación **falla cerrado**: la publishable key que llega hasta aquí
 * viaja en el bundle del cliente, así que cualquiera podría invocarla sin
 * `TIMER_CRON_SECRET`.
 */

const BUCKET = "recipe-photos";
const LIST_PAGE_SIZE = 100; // storage.list() no admite más de 100 por llamada
const RECIPE_PAGE_SIZE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // margen para una subida en curso que aún no se ha guardado como receta
const REMOVE_BATCH = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

  // 1) Recuento exacto de referencias vigentes, con el mismo filtro que la
  // lectura paginada de abajo, para poder comprobar después que ninguna
  // página se saltó una fila.
  const { count: expectedCount, error: countError } = await supabase
    .from("recipe")
    .select("photo_path", { count: "exact", head: true })
    .not("photo_path", "is", null);
  if (countError || expectedCount === null) {
    console.error("cleanup-orphan-photos: failed to count recipe photo_path");
    return json({ error: "failed to count recipe photo_path" }, 500);
  }

  // 2) Referencias vigentes: los photo_path no nulos de `recipe`, leídos con
  // cursor por `id` (no OFFSET: con OFFSET, mover filas de lado entre dos
  // páginas desplazaba el resto y se saltaban referencias vivas de otros
  // hogares). Luego se cuentan las filas leídas contra el recuento exacto de
  // arriba: si no coinciden (alguien escribió durante el barrido), se aborta
  // sin borrar nada. Cualquier fallo de página también aborta sin borrar.
  let rows: { id: string; household_id: string; photo_path: string | null }[];
  try {
    rows = await readAllByKey(async (afterId) => {
      let query = supabase
        .from("recipe")
        .select("id, household_id, photo_path")
        .not("photo_path", "is", null)
        .order("id")
        .limit(RECIPE_PAGE_SIZE);
      if (afterId !== null) query = query.gt("id", afterId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }, RECIPE_PAGE_SIZE);
  } catch {
    console.error("cleanup-orphan-photos: failed to read recipe photo_path");
    return json({ error: "failed to read recipe photo_path" }, 500);
  }

  if (rows.length !== expectedCount) {
    console.error("cleanup-orphan-photos: paginated row count does not match exact count, aborting");
    return json({ error: "reference count mismatch" }, 500);
  }

  // Solo cuentan las rutas dentro de la carpeta del hogar de cada receta:
  // una receta no puede mantener viva la foto de otro hogar.
  const referenced = referencedPaths(rows);

  // 3) Objetos del bucket, a cualquier profundidad bajo cada carpeta de hogar
  // (las subcarpetas ya no se pueden crear, pero las antiguas también se
  // barren). `list()` devuelve como mucho 100 entradas por llamada.
  const objects = await listTree(async (path, offset) => {
    const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: LIST_PAGE_SIZE, offset });
    return error ? null : (data ?? []);
  }, LIST_PAGE_SIZE);
  if (objects === null) {
    console.error("cleanup-orphan-photos: failed to list bucket");
    return json({ error: "failed to list bucket" }, 500);
  }

  // Salvaguarda final: si el bucket tiene objetos pero el conjunto de
  // referencias vino vacío, algo fue mal (RLS, consulta rota…) — abortar sin
  // borrar en vez de arriesgarse a vaciar el bucket entero por error.
  if (objects.length > 0 && referenced.size === 0) {
    console.error("cleanup-orphan-photos: empty reference set with non-empty bucket, aborting");
    return json({ error: "empty reference set" }, 500);
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
    return json({ dryRun: true, checked: objects.length, wouldDelete: orphans.length });
  }

  let deleted = 0;
  for (let i = 0; i < orphans.length; i += REMOVE_BATCH) {
    const batch = orphans.slice(i, i + REMOVE_BATCH).map((o) => o.path);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      // Sin volcar las rutas del lote: no hay que registrar rutas completas.
      console.error("cleanup-orphan-photos: failed to delete a batch");
      continue;
    }
    deleted += batch.length;
  }

  return json({ checked: objects.length, deleted });
});
