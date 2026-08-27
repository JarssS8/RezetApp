import { z } from 'zod'

// Lo que devuelve PushManager.subscribe() en el navegador, recortado a lo que
// hace falta para enviar (endpoint + las dos claves del cifrado aes128gcm).
// El endpoint exige https: el servidor hará peticiones salientes a esa URL
// (web-push), y aceptar otros esquemas abriría un SSRF almacenado.
export const PushSubscriptionSchema = z.strictObject({
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
    auth: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
  }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>
