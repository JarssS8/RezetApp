import { describe, expect, it } from 'vitest';
import { listTree, readAllByKey, referencedPaths, type StorageEntry } from './logic.ts';

const HA = '11111111-1111-4111-8111-111111111111';
const HB = '22222222-2222-4222-8222-222222222222';

describe('referencedPaths', () => {
  // Auditoría run-3 (rezet-supabase:recipe.photo_path:direct-dml-bypasses-save_recipe-folder-guard):
  // una receta solo puede mantener viva una foto de su propio hogar.
  it('ignora rutas que no están en la carpeta del hogar de la receta', () => {
    const refs = referencedPaths([
      { id: '1', household_id: HA, photo_path: `${HA}/a.jpg` },
      { id: '2', household_id: HA, photo_path: `${HB}/pinned.jpg` },
      { id: '3', household_id: HA, photo_path: `${HA}/../${HB}/x.jpg` },
      { id: '4', household_id: HA, photo_path: '' },
      { id: '5', household_id: HA, photo_path: null },
    ]);
    expect([...refs]).toEqual([`${HA}/a.jpg`]);
  });
});

describe('readAllByKey', () => {
  // Auditoría run-3 (rezet-edge:cleanup-orphan-photos:offset-pagination-race-drops-live-references):
  // con OFFSET, mover filas de antes a después del corte entre dos páginas
  // desplazaba el resto y se saltaba referencias vivas de otros hogares.
  it('no se salta una fila estable aunque otras cambien de lado entre páginas', async () => {
    let table = [
      { id: '01', v: 'a1' },
      { id: '02', v: 'a2' },
      { id: '05', v: 'victim' },
      { id: '09', v: null as string | null },
    ].map((r) => ({ ...r }));
    let calls = 0;
    const rows = await readAllByKey(async (afterId) => {
      calls++;
      if (calls === 2) {
        // Entre la página 1 y la 2: dos filas del atacante salen del filtro y
        // otra entra al final; el recuento no cambia.
        table = table.map((r) => (r.id === '01' || r.id === '02' ? { ...r, v: null } : r.id === '09' ? { ...r, v: 'late' } : r));
      }
      return table
        .filter((r) => r.v !== null && (afterId === null || r.id > afterId))
        .sort((x, y) => (x.id < y.id ? -1 : 1))
        .slice(0, 2);
    }, 2);
    expect(rows.map((r) => r.v)).toContain('victim');
  });
});

describe('listTree', () => {
  // Auditoría run-3 (rezet-storage:recipe-photos:nested-prefix-objects-escape-orphan-sweep):
  // los objetos en subcarpetas antiguas también tienen que poder barrerse.
  it('recorre las subcarpetas de cada hogar y devuelve la ruta completa', async () => {
    const tree: Record<string, StorageEntry[]> = {
      '': [{ name: HA, id: null, created_at: null }],
      [HA]: [
        { name: 'flat.jpg', id: 'o1', created_at: '2026-09-01T00:00:00Z' },
        { name: 'sub', id: null, created_at: null },
      ],
      [`${HA}/sub`]: [{ name: 'x.jpg', id: 'o2', created_at: '2026-09-01T00:00:00Z' }],
    };
    const objects = await listTree(async (path, offset) => (offset === 0 ? tree[path] ?? [] : []), 100);
    expect(objects?.map((o) => o.path).sort()).toEqual([`${HA}/flat.jpg`, `${HA}/sub/x.jpg`]);
  });

  it('ignora archivos sueltos en la raíz del bucket', async () => {
    const objects = await listTree(async (path) => (path === '' ? [{ name: 'loose.jpg', id: 'o', created_at: null }] : []), 100);
    expect(objects).toEqual([]);
  });

  it('devuelve null si falla algún listado, para no borrar con una vista parcial', async () => {
    const objects = await listTree(async (path) => (path === '' ? [{ name: HA, id: null, created_at: null }] : null), 100);
    expect(objects).toBeNull();
  });
});
