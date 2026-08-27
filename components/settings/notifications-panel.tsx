'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { BellIcon } from '@/components/icons'

export interface NotificationsPanelProps {
  // Las del usuario, para saber si ESTE dispositivo ya está dado de alta
  // (no hace falta un GET aparte: se compara con la suscripción local).
  subscribedEndpoints: string[]
}

// La clave pública VAPID viaja en base64url y PushManager la quiere en bytes.
// `Uint8Array.from` tipa el resultado como `Uint8Array<ArrayBufferLike>`, que
// no encaja con el `BufferSource` que exige applicationServerKey (solo admite
// ArrayBuffer, no SharedArrayBuffer): se construye a mano para fijar el tipo.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// No hay evento del navegador para "el soporte cambió" o "el permiso cambió":
// ninguno de los dos cambia sin recargar la página. useSyncExternalStore no
// necesita suscribirse a nada real, solo leer una vez tras montar; es lo que
// evita el "setState síncrono dentro de un efecto" que dispararía un repintado
// en cascada, y a la vez resuelve la hidratación: el snapshot del servidor
// (sin navegador) siempre es "sin soporte", y React vuelve a leer el real en
// cuanto hidrata.
function subscribeNever(): () => void {
  return () => {}
}

function getSupportSnapshot(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function getServerSupportSnapshot(): boolean {
  return false
}

function getPermissionSnapshot(): NotificationPermission | null {
  return typeof Notification === 'undefined' ? null : Notification.permission
}

function getServerPermissionSnapshot(): NotificationPermission | null {
  return null
}

export function NotificationsPanel({ subscribedEndpoints }: NotificationsPanelProps) {
  const t = useTranslations('settings')
  const supported = useSyncExternalStore(subscribeNever, getSupportSnapshot, getServerSupportSnapshot)
  const permission = useSyncExternalStore(subscribeNever, getPermissionSnapshot, getServerPermissionSnapshot)
  const [subscribed, setSubscribed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!supported || permission !== 'granted') return
    // Ya se ha concedido el permiso en algún momento: se comprueba si este
    // dispositivo concreto sigue dado de alta en el servidor. El setState va
    // dentro del callback de la promesa (evento externo), no suelto en el
    // cuerpo del efecto.
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (existing && subscribedEndpoints.includes(existing.endpoint)) setSubscribed(true)
      })
  }, [supported, permission, subscribedEndpoints])

  async function enable() {
    setError(false)
    setPending(true)
    try {
      const permissionResult = await Notification.requestPermission()
      // No hace falta guardar el resultado en un estado propio: el siguiente
      // repintado (lo dispara setPending/setSubscribed/setError más abajo) lee
      // el permiso real del navegador a través de useSyncExternalStore.
      if (permissionResult !== 'granted') return
      const registration = await navigator.serviceWorker.ready
      const { publicKey } = (await (await fetch('/api/push/public-key')).json()) as { publicKey: string }
      const subscription = await registration.pushManager.subscribe({
        // Obligatorio en todos los navegadores: cada push tiene que enseñar una
        // notificación. No hay push silencioso, y así debe ser.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!response.ok) throw new Error('subscribe failed')
      setSubscribed(true)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function disable() {
    setError(false)
    setPending(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }
      setSubscribed(false)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!supported && <p className="text-sm text-text-2">{t('notifications.unsupported')}</p>}
      {supported && permission === 'denied' && (
        <p role="alert" className="text-sm text-warn">
          {t('notifications.denied')}
        </p>
      )}
      {supported && permission !== 'denied' && (
        <div className="flex flex-col gap-2">
          <Button type="button" variant={subscribed ? 'outline' : 'default'} aria-busy={pending} disabled={pending} onClick={() => void (subscribed ? disable() : enable())}>
            <BellIcon size={18} />
            {subscribed ? t('notifications.disable') : t('notifications.enable')}
          </Button>
          {subscribed && <p className="text-sm text-text-2">{t('notifications.enabled')}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn">
          {t('notifications.error')}
        </p>
      )}
      <p className="text-sm text-text-2">{t('notifications.devices', { count: subscribedEndpoints.length })}</p>
    </div>
  )
}
