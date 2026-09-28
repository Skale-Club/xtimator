/**
 * Push-only service worker (260928).
 *
 * Delivers "your estimate is ready" when the app is closed or the phone is
 * locked. It deliberately does NOTHING else:
 *
 *  - NO fetch handler. The previous PWA worker (/sw.js) cached assets and
 *    caused production regressions; this one never touches network requests.
 *  - Registered with scope '/push/', a path the app never serves. A worker only
 *    controls pages inside its scope, so this one controls no page at all. Push
 *    events are delivered to the registration regardless of scope.
 *
 * The app shell's SWRegister and the chunk-recovery path unregister every
 * OTHER worker; they keep this one (see lib/pwa/push-worker.ts).
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Xtimator'
  const options = {
    body: data.body || '',
    // Same tag as the in-app notice for this attempt: a later notification for
    // the same generation replaces the earlier one instead of stacking.
    tag: data.tag || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }

  // Always show the notification. Safari revokes the subscription of a site
  // that receives a push without displaying one.
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Reuse an open app window when there is one: focus it and take it to
      // the estimate. Otherwise open a new one.
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue
        try {
          await client.focus()
          if ('navigate' in client) await client.navigate(target.href)
          return
        } catch {
          // Fall through to opening a new window.
        }
      }
      await self.clients.openWindow(target.href)
    })()
  )
})
