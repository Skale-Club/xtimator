/**
 * Xtimator service worker — offline cache (Phase 76.1) + push notifications (Phase 77).
 *
 * Caching strategy:
 *   - _next/static/* and /icons/*  → CacheFirst (immutable assets)
 *   - navigation (pages)           → StaleWhileRevalidate with offline fallback
 *   - /api/*                       → NetworkOnly (mutations, AI)
 *   - supabase REST/realtime       → NetworkOnly
 *   - push events                  → show notification (Phase 77 scaffold)
 */

const CACHE_V = 'v2'
const SHELL   = `shell-${CACHE_V}`
const PAGES   = `pages-${CACHE_V}`

const KNOWN_CACHES = [SHELL, PAGES]

// ── Install: pre-cache offline fallback page ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/offline'])).catch(() => {})
  )
  self.skipWaiting()
})

// ── Activate: evict old cache versions ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Pass through non-GET requests
  if (request.method !== 'GET') return

  // Pass through cross-origin requests (Supabase, Stripe, etc.)
  if (url.origin !== self.location.origin) return

  // NetworkOnly: all API routes
  if (url.pathname.startsWith('/api/')) return

  // CacheFirst: immutable static assets and icons
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(SHELL, request))
    return
  }

  // StaleWhileRevalidate: navigations and other same-origin pages
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(staleWhileRevalidateWithFallback(PAGES, request))
    return
  }
})

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidateWithFallback(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)

  if (cached) {
    // Return cached immediately; update in background
    fetchPromise.catch(() => {})
    return cached
  }

  // No cache — try network, fall back to /offline
  const response = await fetchPromise
  if (response) return response
  const offlinePage = await caches.match('/offline')
  return offlinePage ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } })
}

// ── Push notifications (Phase 77 scaffold) ────────────────────────────────
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
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.linkUrl) || '/notifications'
  event.waitUntil(self.clients.openWindow(url))
})
