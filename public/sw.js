/**
 * Xtimator service worker — Phase 77 (NOTIF-09) Phase 1 scaffold.
 *
 * Handles the 'push' event so that when Phase 2 wires VAPID server keys + the
 * web-push library, no client deploy is required. For Phase 1, this file just
 * exists so navigator.serviceWorker.register('/sw.js') succeeds and the
 * pushManager.subscribe() call has a controller to register against.
 *
 * Actual server-side push delivery (the .send() call) is deferred to Phase 2.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'Xtimator', body: '', linkUrl: '/notifications' }
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.linkUrl) || '/notifications'
  event.waitUntil(self.clients.openWindow(url))
})
