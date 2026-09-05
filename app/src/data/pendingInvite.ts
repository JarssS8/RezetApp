const KEY = 'rezet.pendingInvite';

/**
 * Se llama una vez al arrancar la app. Si llegas por un enlace de invitación
 * (`?invite=CODIGO`), lo guarda para sobrevivir al ir y volver de Google/Apple
 * (el `redirectTo` del login no conserva la query string) y limpia la URL.
 */
export function capturePendingInviteFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');
  if (!code) return;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* almacenamiento no disponible: el enlace deja de ayudar, pero no rompe nada */
  }
  params.delete('invite');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

/** Lee y borra el código pendiente — se usa una sola vez. */
export function consumePendingInvite(): string | null {
  try {
    const code = localStorage.getItem(KEY);
    if (code) localStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
}
