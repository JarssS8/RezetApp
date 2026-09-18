import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Diseño §3.4 (segunda mitad) — barrido diario del bucket `recipe-photos`:
 * borra lo que ya no referencia ninguna receta. El borrado en el cliente
 * (Fase A) cubre lo que se borre a partir de ahora; esto limpia lo viejo y
 * lo que dejan los borrados de hogar/cuenta, que desde SQL no pueden tocar
 * Storage.
 *
 * Solo la llama el cron (`cleanup-orphan-photos-daily`, migración
 * rezet_cleanup_orphan_photos_cron). A diferencia de `send-timer-
 * notifications`, aquí la autenticación **falla cerrado**: allí no reaccionar
 * es inocuo y por eso es tolerante mientras `TIMER_CRON_SECRET` no esté
 * configurado; aquí lo único que hace esta función es borrar, así que no
 * hacer nada es inocuo y borrar sin autenticar no lo es — y la publishable
 * key que llega hasta aquí viaja en el bundle del cliente, así que cualquiera
 * podría invocarla sin este secreto.
 */

const BUCKET = "recipe-photos";
const LIST_PAGE_SIZE = 100; // storage.list() no admite más de 100 por llamada
const RECIPE_PAGE_SIZE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // margen para una subida en curso que aún no se ha guardado como receta
const REMOVE_BATCH = 100;

interface StorageEntry {
  name: string;
  id: string | null;
  created_at: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("TIMER_CRON_SECRET");
  if (!cronSecret) {
    // Despliegue tolerante en send-timer-notifications, pero no aquí: esta
    // función solo borra, así que sin secreto configurado se rechaza todo.
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

  // 1) Referencias vigentes: todos los photo_path no nulos de `recipe`,
  // paginados explícitamente. Cualquier fallo de página aborta sin borrar
  // nada — un borrado por ruta es irreversible, así que ante la duda no se
  // borra.
  const referenced = new Set<string>();
  for (let from = 0; ; from += RECIPE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipe")
      .select("photo_path")
      .not("photo_path", "is", null)
      .range(from, from + RECIPE_PAGE_SIZE - 1);
    if (error) {
      console.error("cleanup-orphan-photos: failed to read recipe photo_path");
      return json({ error: "failed to read recipe photo_path" }, 500);
    }
    for (const row of data ?? []) {
      if (row.photo_path) referenced.add(row.photo_path as string);
    }
    if (!data || data.length < RECIPE_PAGE_SIZE) break;
  }

  // 2) Objetos del bucket, carpeta a carpeta: el primer nivel son los
  // household_id, y `list()` solo devuelve como mucho 100 entradas por
  // llamada, así que cada nivel se pagina por su cuenta.
  let listFailed = false;
  async function listAll(path: string): Promise<StorageEntry[]> {
    const all: StorageEntry[] = [];
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await supabase.storage.from(BUCKET).list(path, {
        limit: LIST_PAGE_SIZE,
        offset,
      });
      if (error) {
        listFailed = true;
        return all;
      }
      all.push(...((data ?? []) as StorageEntry[]));
      if (!data || data.length < LIST_PAGE_SIZE) break;
    }
    return all;
  }

  const folders = await listAll("");
  if (listFailed) {
    console.error("cleanup-orphan-photos: failed to list bucket root");
    return json({ error: "failed to list bucket" }, 500);
  }

  const objects: { path: string; createdAt: string | null }[] = [];
  for (const folder of folders) {
    if (folder.id !== null) {
      // No se esperan archivos sueltos en la raíz del bucket: el primer nivel
      // son carpetas de household_id (ver migración rezet_recipe_photos_storage).
      // Uno ahí sería una anomalía; se ignora en vez de borrarlo sin poder
      // resolver a qué hogar pertenece.
      continue;
    }
    const entries = await listAll(folder.name);
    if (listFailed) {
      console.error("cleanup-orphan-photos: failed to list household folder");
      return json({ error: "failed to list bucket" }, 500);
    }
    for (const entry of entries) {
      if (entry.id === null) continue; // subcarpeta inesperada dentro de un hogar: se ignora
      objects.push({ path: `${folder.name}/${entry.name}`, createdAt: entry.created_at });
    }
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
