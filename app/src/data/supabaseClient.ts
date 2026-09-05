import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (ver .env.example)');
}

export const supabase = createClient(url, anonKey, {
  // Passkeys son experimentales en supabase-js: hay que optar explícitamente.
  // Requiere habilitar "Passkeys" en el dashboard (Authentication → Passkeys)
  // con el Relying Party ID del dominio real antes de publicar.
  auth: { experimental: { passkey: true } },
});
