/**
 * Lógica pura del barrido de `recipe-photos`, sin dependencias: la usa
 * index.ts en Deno y la prueban los tests de vitest (logic.test.ts).
 */

export interface StorageEntry {
  name: string;
  id: string | null;
  created_at: string | null;
}

export interface StoredObject {
  path: string;
  createdAt: string | null;
}

/**
 * Rutas que siguen en uso. Una receta solo mantiene viva una foto de su
 * propio hogar: una ruta fuera de `<household_id>/`, o con `..`, no cuenta
 * (auditoría run-3: con un PATCH directo de photo_path se podía fijar la
 * foto de otro hogar para que la limpieza nunca la borrase).
 */
export function referencedPaths(
  rows: { household_id: string; photo_path: string | null }[],
): Set<string> {
  const refs = new Set<string>();
  for (const row of rows) {
    const p = row.photo_path;
    if (!p || p.includes('..') || !p.startsWith(`${row.household_id}/`)) continue;
    refs.add(p);
  }
  return refs;
}

/**
 * Lee una tabla entera por páginas con cursor por clave (`id > último`), no
 * por OFFSET. Con OFFSET, que alguien moviera filas de antes a después del
 * corte entre dos páginas desplazaba todo lo demás y se saltaban filas de
 * otros hogares (auditoría run-3); con cursor, una fila que existe durante
 * todo el barrido se lee siempre. `fetchAfter` debe devolver las filas con
 * `id` estrictamente mayor que `afterId`, ordenadas por `id`, como mucho
 * `pageSize`; lanza si falla la consulta.
 */
export async function readAllByKey<T extends { id: string }>(
  fetchAfter: (afterId: string | null) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  const all: T[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page = await fetchAfter(afterId);
    all.push(...page);
    if (page.length < pageSize) return all;
    afterId = page[page.length - 1].id;
  }
}

/**
 * Todos los objetos bajo cada carpeta de hogar, a cualquier profundidad.
 * El primer nivel son carpetas de household_id; un archivo suelto en la raíz
 * es una anomalía y se ignora (no se puede saber de qué hogar es). Las
 * subcarpetas ya no se pueden crear (política de nombres planos), pero las
 * antiguas se recorren para que su contenido también se barra. Devuelve
 * `null` si falla cualquier listado: con una vista parcial no se borra nada.
 * `list` devuelve `null` si hay error.
 */
export async function listTree(
  list: (path: string, offset: number) => Promise<StorageEntry[] | null>,
  pageSize: number,
): Promise<StoredObject[] | null> {
  async function listAll(path: string): Promise<StorageEntry[] | null> {
    const all: StorageEntry[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await list(path, offset);
      if (page === null) return null;
      all.push(...page);
      if (page.length < pageSize) return all;
    }
  }

  async function walk(prefix: string, out: StoredObject[]): Promise<boolean> {
    const entries = await listAll(prefix);
    if (entries === null) return false;
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        if (!(await walk(path, out))) return false;
      } else {
        out.push({ path, createdAt: entry.created_at });
      }
    }
    return true;
  }

  const root = await listAll('');
  if (root === null) return null;
  const objects: StoredObject[] = [];
  for (const folder of root) {
    if (folder.id !== null) continue;
    if (!(await walk(folder.name, objects))) return null;
  }
  return objects;
}
