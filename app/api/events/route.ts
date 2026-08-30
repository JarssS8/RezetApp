import { getCurrentSession } from '@/lib/auth/guards'
import { subscribeHousehold } from '@/lib/events/bus'

const HEARTBEAT_MS = 25_000

export async function GET(request: Request): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const householdId = session.household.id
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // cliente desconectado
        }
      }
      const cleanup = () => {
        unsubscribe?.()
        unsubscribe = null
        if (timer) clearInterval(timer)
        timer = null
      }
      send(`: connected\n\n`)
      unsubscribe = subscribeHousehold(householdId, (e) => send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
      timer = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS)
      // Next no siempre invoca cancel() del stream al abortar la conexión;
      // escuchamos también request.signal para no dejar el listener/timer vivos.
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // ya estaba cerrado
        }
      })
    },
    cancel() {
      unsubscribe?.()
      unsubscribe = null
      if (timer) clearInterval(timer)
      timer = null
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
