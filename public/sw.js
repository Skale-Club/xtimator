/**
 * Emergency service worker cleanup.
 *
 * The PWA service worker caused production asset regressions on already
 * registered browsers. Keep this file at /sw.js so existing registrations can
 * update to a no-fetch worker, clean up our caches, and unregister themselves.
 */

const CACHE_PREFIXES = ['shell-', 'pages-']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupServiceWorker())
})

async function cleanupServiceWorker() {
  try {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => caches.delete(key))
    )
  } catch {
    // Best-effort cleanup. Do not block unregistering the worker.
  }

  await self.clients.claim()
  await self.registration.unregister()
}
