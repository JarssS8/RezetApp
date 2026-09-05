import { supabase } from './supabaseClient';

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSubscribeResult = 'subscribed' | 'denied' | 'unsupported' | 'error';

/**
 * Pide permiso, se suscribe al push del navegador y guarda la suscripción en
 * `push_subscription` (RLS: cada perfil solo ve/borra la suya). El servidor
 * (Edge Function + pg_cron) es quien decide cuándo mandar algo — esto solo
 * abre el canal.
 */
export async function subscribeToPush(profileId: string): Promise<PushSubscribeResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) return 'error';

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const json = subscription.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth || !subscription.endpoint) return 'error';

    const { error } = await supabase.from('push_subscription').upsert(
      {
        profile_id: profileId,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' },
    );
    return error ? 'error' : 'subscribed';
  } catch {
    return 'error';
  }
}
