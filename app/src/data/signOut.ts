export type SignOutScope = 'local' | 'global';

export interface SignOutDeps {
  unsubscribePush: () => Promise<unknown>;
  clearDeviceState: () => void;
  authSignOut: (scope: SignOutScope) => Promise<unknown>;
}

/**
 * Cierre de sesión (diseño §3.8): deja el dispositivo limpio y luego invalida
 * la sesión en GoTrue. Cada paso previo va en su propio try/catch: un fallo
 * (red caída, sin service worker, almacenamiento bloqueado…) no debe impedir
 * cerrar sesión.
 *
 * - `'local'` ("Cerrar sesión"): solo esta sesión. Los demás dispositivos y
 *   los asistentes IA conectados siguen dentro.
 * - `'global'` ("Cerrar sesión en todos los dispositivos"): todas las sesiones
 *   de la cuenta, incluida la que guarda cada concesión del MCP remoto, cuyo
 *   siguiente refresco falla con invalid_grant.
 *
 * `pushTimeoutMs`: unsubscribePush() espera a navigator.serviceWorker.ready,
 * que en dev (o si el registro falló) nunca se resuelve; se corre contra un
 * timeout para que el cierre avance siempre, con o sin push.
 */
export async function performSignOut(deps: SignOutDeps, scope: SignOutScope, pushTimeoutMs = 3000): Promise<void> {
  try {
    await Promise.race([deps.unsubscribePush(), new Promise((resolve) => setTimeout(resolve, pushTimeoutMs))]);
  } catch {
    /* no bloquea el cierre de sesión */
  }
  try {
    deps.clearDeviceState();
  } catch {
    /* almacenamiento no disponible: no bloquea el cierre de sesión */
  }
  await deps.authSignOut(scope);
}
