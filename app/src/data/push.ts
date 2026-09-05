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

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Desactiva a la vez en el navegador y en `push_subscription` — dejar solo lo primero revivía la suscripción sola en el próximo `subscribe()`. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscription').delete().eq('endpoint', endpoint);
    return true;
  } catch {
    return false;
  }
}

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
