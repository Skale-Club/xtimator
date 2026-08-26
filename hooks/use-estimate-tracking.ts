'use client'

/**
 * Phase 193-01 — client-side engagement tracker for the public share page.
 *
 * Mounted once by components/share/estimate-view.tsx (both /estimate/[token]
 * and its friendly-URL sibling already pass the real token in). Buffers
 * anonymous opens/clicks/scroll/section/heartbeat events and flushes them in
 * batches to POST /api/track/estimate via sendBeacon — see that route's doc
 * comment for the server-side contract (always 204, never an oracle).
 *
 * Identity:
 * - visitor_id: a uuid persisted in localStorage, created lazily. Wrapped in
 *   try/catch because Safari private-mode throws on any localStorage write.
 *   A visitor with storage blocked still gets tracked for THIS session, just
 *   without cross-session dedup.
 * - session_id: a fresh uuid per mount (per tab/reload) — never persisted.
 *
 * `containerRef` must point at the DOM node wrapping the rendered estimate
 * document (NOT the whole page — the Accept/Decline CTA, invoice cards, etc.
 * live outside it). Click x/y and doc_h are measured against that node so a
 * future heatmap overlay (Phase 193-03) can position dots against the exact
 * surface it renders over, at any viewport width.
 *
 * `enabled` defaults to true; the share page passes false while an estimate
 * is behind an unlock gate (Phase 193-02) so a locked page's DOM is never
 * fingerprinted before the visitor has proven they hold the password.
 */
import { useEffect, type RefObject } from 'react'

const TRACK_ENDPOINT = '/api/track/estimate'
const VISITOR_ID_STORAGE_KEY = 'xtimator_visitor_id'

const FLUSH_INTERVAL_MS = 5_000
const FLUSH_AT_BUFFER_SIZE = 20 // stays under the server's 25-per-batch cap
const HEARTBEAT_INTERVAL_MS = 20_000
const HEARTBEAT_CAP = 30 // 30 * 20s = 10 minutes of heartbeats per session
const SCROLL_MILESTONES = [25, 50, 75, 100] as const
const SECTION_VISIBLE_THRESHOLD = 0.5
const MOBILE_BREAKPOINT_PX = 768

type ClientEventType = 'view' | 'click' | 'scroll_depth' | 'section_view' | 'heartbeat'

interface TrackEventInput {
  event_type: ClientEventType
  target?: string
  x_pct?: number
  y_px?: number
  doc_h?: number
  viewport_w?: number
  device?: 'mobile' | 'desktop'
  metadata?: Record<string, unknown>
}

function safeRandomUUID(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Extremely old browser without crypto.randomUUID — a session-scoped
    // fallback is fine, it only needs to be unique enough to group one
    // visit's events together.
    return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function getOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)
    if (existing) return existing
    const created = safeRandomUUID()
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, created)
    return created
  } catch {
    // Safari private mode / storage disabled — fall back to a session-only id.
    return safeRandomUUID()
  }
}

function currentDevice(): 'mobile' | 'desktop' {
  return window.innerWidth < MOBILE_BREAKPOINT_PX ? 'mobile' : 'desktop'
}

function sendBatch(token: string, visitorId: string, sessionId: string, events: TrackEventInput[]): void {
  if (events.length === 0) return
  try {
    const payload = JSON.stringify({ token, visitor_id: visitorId, session_id: sessionId, events })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      const accepted = navigator.sendBeacon(TRACK_ENDPOINT, blob)
      if (accepted) return
    }
    // Fallback for browsers without sendBeacon (or a beacon the UA rejected
    // for being oversized) — keepalive lets it survive a page unload.
    void fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* best-effort — the beacon is disposable telemetry */
    })
  } catch {
    /* best-effort — never let tracking break the page */
  }
}

interface UseEstimateTrackingOptions {
  token: string
  containerRef: RefObject<HTMLElement | null>
  enabled?: boolean
}

export function useEstimateTracking({
  token,
  containerRef,
  enabled = true,
}: UseEstimateTrackingOptions): void {
  useEffect(() => {
    if (!enabled || !token) return

    const visitorId = getOrCreateVisitorId()
    const sessionId = safeRandomUUID()

    let buffer: TrackEventInput[] = []
    function enqueue(event: TrackEventInput) {
      buffer.push(event)
      if (buffer.length >= FLUSH_AT_BUFFER_SIZE) flush()
    }
    function flush() {
      if (buffer.length === 0) return
      const batch = buffer
      buffer = []
      sendBatch(token, visitorId, sessionId, batch)
    }

    // Initial open — one per mount (reload/new-tab starts a new session,
    // matching the "1 open = 1 page-load view event" definition).
    enqueue({ event_type: 'view', device: currentDevice(), viewport_w: window.innerWidth })

    // -- Clicks (capture phase, scoped to the document surface) --------------
    function handleClick(e: MouseEvent) {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const targetEl = e.target instanceof Element ? e.target.closest('[data-track-section]') : null
      enqueue({
        event_type: 'click',
        target: targetEl?.getAttribute('data-track-section') ?? undefined,
        x_pct: ((e.clientX - rect.left) / rect.width) * 100,
        y_px: Math.round(e.clientY - rect.top),
        doc_h: Math.round(rect.height),
      })
    }
    containerRef.current?.addEventListener('click', handleClick, { capture: true })

    // -- Section visibility (IntersectionObserver, once per section) --------
    const seenSections = new Set<string>()
    const observedElements = new Set<Element>()
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < SECTION_VISIBLE_THRESHOLD) continue
          const id = entry.target.getAttribute('data-track-section')
          if (!id || seenSections.has(id)) continue
          seenSections.add(id)
          enqueue({ event_type: 'section_view', target: id })
          sectionObserver.unobserve(entry.target)
        }
      },
      { threshold: SECTION_VISIBLE_THRESHOLD }
    )
    function observeNewSections() {
      const container = containerRef.current
      if (!container) return
      container.querySelectorAll('[data-track-section]').forEach((el) => {
        if (observedElements.has(el)) return
        observedElements.add(el)
        sectionObserver.observe(el)
      })
    }
    observeNewSections()
    // The document surface renders behind a next/dynamic loading skeleton
    // (see components/share/estimate-view.tsx) — its [data-track-section]
    // nodes don't exist at mount time, only after the chunk loads. A
    // MutationObserver picks up that swap (and any later content change)
    // without polling.
    const mutationObserver = new MutationObserver(observeNewSections)
    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, { childList: true, subtree: true })
    }

    // -- Scroll depth (25/50/75/100%, once each) ------------------------------
    const seenScrollMilestones = new Set<number>()
    function handleScroll() {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
      if (scrollableHeight <= 0) return
      const pct = (window.scrollY / scrollableHeight) * 100
      for (const milestone of SCROLL_MILESTONES) {
        if (pct >= milestone && !seenScrollMilestones.has(milestone)) {
          seenScrollMilestones.add(milestone)
          enqueue({ event_type: 'scroll_depth', metadata: { pct: milestone } })
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    // -- Heartbeat (visible tab only, capped) ---------------------------------
    let heartbeatCount = 0
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (heartbeatCount >= HEARTBEAT_CAP) return
      heartbeatCount += 1
      enqueue({ event_type: 'heartbeat', metadata: { seconds: HEARTBEAT_INTERVAL_MS / 1000 } })
    }, HEARTBEAT_INTERVAL_MS)

    // -- Flush cadence ---------------------------------------------------------
    const flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS)
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flush)

    return () => {
      containerRef.current?.removeEventListener('click', handleClick, { capture: true })
      sectionObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('scroll', handleScroll)
      window.clearInterval(heartbeatTimer)
      window.clearInterval(flushTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flush)
      flush()
    }
    // containerRef is a stable ref object — intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, enabled])
}
