// Avisa por notificación push de lo que caduca. Pensado para un cron diario:
//   0 9 * * *  docker compose exec -T app node dist/scripts/notify-expiring.mjs
// La app no trae planificador propio a propósito (spec §15: una imagen y
// Postgres, nada más).
import { db } from '@/db'
import { notifyExpiring } from '@/lib/services/push'

notifyExpiring(db)
  .then((r) => console.log(`push: ${r.sent} avisos enviados, ${r.removed} suscripciones caducadas borradas`))
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
