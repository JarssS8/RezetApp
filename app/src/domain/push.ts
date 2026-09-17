/**
 * Hosts de los servicios de Web Push reales. `push_subscription.endpoint` lo
 * escribe el cliente y el cron lo visita cada minuto con el rol de servicio, así
 * que sin esta lista una suscripción podía apuntar a cualquier URL y convertir
 * ese cron en un emisor de peticiones a gusto de quien la guardara.
 */
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
