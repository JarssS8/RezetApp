// Service worker mínimo escrito a mano (spec §15). Sin Workbox y sin librerías:
// así se ve de un vistazo qué se guarda y qué no.
//
// NO se cachea ninguna respuesta de navegación ni de API: esta app es
// multi-hogar y guardar HTML autenticado acabaría enseñando datos de otra
// sesión. Lo único que se precachea es el armazón sin datos: la página de
// "sin conexión" y los iconos.
const CACHE = 'rezetapp-shell-v2'
const SHELL = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Solo navegaciones GET del propio origen: todo lo demás va a la red sin
  // que el service worker se meta por medio.
  if (request.method !== 'GET' || request.mode !== 'navigate') return
  event.respondWith(fetch(request).catch(() => caches.match('/offline')))
})

self.addEventListener('push', (event) => {
  // Sin datos (o con datos ilegibles) se enseña un aviso genérico: el navegador
  // exige mostrar SIEMPRE una notificación tras un push (userVisibleOnly).
  let data = { title: 'RezetApp', body: '', url: '/today' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // carga no-JSON: se queda el aviso genérico
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/today'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Si ya hay una pestaña de la app abierta, se enfoca en vez de abrir otra.
      const open = list.find((client) => client.url.includes(url))
      if (open) return open.focus()
      return self.clients.openWindow(url)
    }),
  )
})
