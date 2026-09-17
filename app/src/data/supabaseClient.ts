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
  //
  // flowType pkce: por defecto auth-js usa el flujo implícito, que devuelve los
  // tokens de sesión en el fragmento de la URL de retorno. Con pkce lo que
  // vuelve es un código que no sirve sin el verificador guardado en este
  // navegador.
  auth: { experimental: { passkey: true }, flowType: 'pkce' },
});
