// Envoltorio del paquete `web-push` (VAPID + cifrado aes128gcm de la carga).
// Vive en integrations y no en services porque no toca la base de datos: recibe
// las claves y el destino ya resueltos.
import webpush from 'web-push'

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function generateVapidKeys(): VapidKeys {
  const keys = webpush.generateVAPIDKeys()
  return { publicKey: keys.publicKey, privateKey: keys.privateKey }
}

// `gone` distingue "esta suscripción ya no existe" (404/410: el navegador la
// revocó) de un fallo pasajero: solo en el primer caso hay que borrarla.
export async function sendWebPush(
  target: PushTarget,
  payload: string,
  vapid: VapidKeys & { subject: string },
): Promise<{ ok: true } | { ok: false; gone: boolean }> {
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, payload, {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 60 * 60 * 12,
    })
    return { ok: true }
  } catch (e) {
    const status = typeof e === 'object' && e !== null && 'statusCode' in e ? (e as { statusCode?: number }).statusCode : undefined
    return { ok: false, gone: status === 404 || status === 410 }
  }
}
