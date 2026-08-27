import { z } from 'zod'
import { isPrivateOrReservedHost } from '@/lib/net-hosts'

// Lo que devuelve PushManager.subscribe() en el navegador, recortado a lo que
// hace falta para enviar (endpoint + las dos claves del cifrado aes128gcm).
// El endpoint exige https: el servidor hará peticiones salientes a esa URL
// (web-push), y aceptar otros esquemas abriría un SSRF almacenado. Que sea
// https no basta (fix 3 de la revisión final): nada impide que el hostname de
// una URL https apunte a un host privado o reservado (169.254.169.254, la LAN
// del propio servidor…), así que se rechaza también por host con la misma
// función que ya protege la descarga de recetas.
export const PushSubscriptionSchema = z.strictObject({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(1024)
    .refine((v) => !isPrivateOrReservedHost(new URL(v).hostname), 'No se admite un endpoint de push hacia un host privado o reservado'),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
    auth: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
  }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>
