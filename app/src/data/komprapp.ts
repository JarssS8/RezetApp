import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { toKomprappItem } from '../domain/komprappExport';
import type { ShoppingNeed } from '../types';

const KOMPRAPP_URL = import.meta.env.VITE_KOMPRAPP_SUPABASE_URL as string | undefined;
const KOMPRAPP_ANON_KEY = import.meta.env.VITE_KOMPRAPP_SUPABASE_ANON_KEY as string | undefined;

// Cliente creado perezosamente, no al importar el módulo, y con
// detectSessionInUrl/persistSession/autoRefreshToken todos en false: los
// defaults de supabase-js intentan leer un fragmento #access_token o
// ?code=... de la URL actual y guardar sesión en localStorage — esta app
// (Rezet) YA tiene su propio flujo de login corriendo contra SU PROPIO
// proyecto de Supabase; un segundo cliente con los defaults intentaría
// consumir el mismo callback OAuth y podría competir con el login real.
// Este cliente no necesita sesión propia: la RPC de komprapp se llama solo
// con la anon key, sin usuario de komprapp.
let _komprappClient: SupabaseClient | null | undefined;
function getKomprappClient(): SupabaseClient | null {
  if (_komprappClient !== undefined) return _komprappClient;
  _komprappClient =
    KOMPRAPP_URL && KOMPRAPP_ANON_KEY
      ? createClient(KOMPRAPP_URL, KOMPRAPP_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  return _komprappClient;
}

const MAX_ITEMS_PER_CALL = 100; // debe coincidir con el tope de la RPC (Tarea 1)

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Llama a la RPC `import_shopping_items` de komprapp (repo `ShoppingList`)
 * directamente — nunca toca sus tablas `lists`/`products` por REST. Trocea
 * en llamadas de máx. `MAX_ITEMS_PER_CALL` porque la RPC rechaza payloads
 * más grandes de golpe en vez de truncarlos en silencio. Lanza si
 * `VITE_KOMPRAPP_SUPABASE_URL`/`_ANON_KEY` no están configuradas, o si
 * cualquier tanda falla (token inválido, límite de tasa, etc.) — quien
 * llama decide cómo mostrarlo (toast). Nota: si una tanda falla a mitad de
 * una lista larga, las tandas anteriores ya se insertaron (no es atómico
 * entre tandas) — aceptable en v1 dado el tope de 100 hace esto raro en la
 * práctica (una lista de la compra normal nunca se acerca a ese tamaño).
 */
export async function importToKomprapp(
  token: string,
  needs: Pick<ShoppingNeed, 'name' | 'quantity' | 'unit'>[],
): Promise<number> {
  const client = getKomprappClient();
  if (!client) throw new Error('komprapp no configurado');
  const items = needs.map(toKomprappItem);
  let total = 0;
  for (const batch of chunk(items, MAX_ITEMS_PER_CALL)) {
    const { data, error } = await client.rpc('import_shopping_items', {
      p_token: token,
      p_items: batch,
    });
    if (error) throw new Error(error.message);
    total += data as number;
  }
  return total;
}
