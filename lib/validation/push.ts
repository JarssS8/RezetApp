import { z } from 'zod'

// Lo que devuelve PushManager.subscribe() en el navegador, recortado a lo que
// hace falta para enviar (endpoint + las dos claves del cifrado aes128gcm).
export const PushSubscriptionSchema = z.strictObject({
  endpoint: z.url().max(1024),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>
