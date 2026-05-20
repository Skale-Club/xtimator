// lib/tour/persistence.ts
// Namespaced localStorage layer for the tour system (Phase 75).
// All keys live under `xtimator:tour:v1:*` so a single clear sweep restarts the tour.
//
// See `.planning/phases/75-tour-and-tooltip-qa/75-RESEARCH.md` (Persistence Layer)
// and `tests/visual/tour-inventory.md` (section 3) for the legacy ↔ target keyspaces.

export const TOUR_NS = "xtimator:tour:v1:"

const TOOLTIP_PREFIX = `${TOUR_NS}tooltip:`
const SPOTLIGHT_COMPLETED_KEY = `${TOUR_NS}spotlight:completed`
const SPOTLIGHT_PENDING_KEY = `${TOUR_NS}spotlight:pending`

// Legacy keys (pre-Phase-75) — used only by migrateLegacyKeys()
const LEGACY_TOOLTIP_PREFIX = "tooltip_seen_"
const LEGACY_COMPLETED_KEY = "tour_completed"
const LEGACY_PENDING_KEY = "tour_spotlight_pending"

export type TooltipState = { seen: boolean; dismissedAt?: string }

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Convert legacy long key ("tooltip_seen_language_toggle") to short suffix ("language_toggle").
// Also accepts the short form already and returns it unchanged.
function normalizeTooltipKey(key: string): string {
  return key.startsWith(LEGACY_TOOLTIP_PREFIX)
    ? key.slice(LEGACY_TOOLTIP_PREFIX.length)
    : key
}

export function readTooltipState(key: string): TooltipState {
  const ls = safeLocalStorage()
  if (!ls) return { seen: false }
  const raw = ls.getItem(TOOLTIP_PREFIX + normalizeTooltipKey(key))
  if (!raw) return { seen: false }
  try {
    const v = JSON.parse(raw) as { seen?: unknown; dismissedAt?: unknown }
    return {
      seen: v.seen === true,
      dismissedAt: typeof v.dismissedAt === "string" ? v.dismissedAt : undefined,
    }
  } catch {
    return { seen: false }
  }
}

export function markTooltipSeen(key: string): void {
  const ls = safeLocalStorage()
  if (!ls) return
  ls.setItem(
    TOOLTIP_PREFIX + normalizeTooltipKey(key),
    JSON.stringify({ seen: true, dismissedAt: new Date().toISOString() })
  )
}

export function isSpotlightCompleted(): boolean {
  const ls = safeLocalStorage()
  if (!ls) return false
  const raw = ls.getItem(SPOTLIGHT_COMPLETED_KEY)
  if (!raw) return false
  try {
    return (JSON.parse(raw) as { seen?: unknown }).seen === true
  } catch {
    return false
  }
}

export function markSpotlightCompleted(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  ls.setItem(
    SPOTLIGHT_COMPLETED_KEY,
    JSON.stringify({ seen: true, dismissedAt: new Date().toISOString() })
  )
}

export function setSpotlightPending(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  ls.setItem(SPOTLIGHT_PENDING_KEY, JSON.stringify({ pending: true }))
}

export function isSpotlightPending(): boolean {
  const ls = safeLocalStorage()
  if (!ls) return false
  const raw = ls.getItem(SPOTLIGHT_PENDING_KEY)
  if (!raw) return false
  try {
    return (JSON.parse(raw) as { pending?: unknown }).pending === true
  } catch {
    return false
  }
}

export function clearSpotlightPending(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  ls.removeItem(SPOTLIGHT_PENDING_KEY)
}

export function clearAllTourState(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  const toRemove: string[] = []
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)
    if (k && k.startsWith(TOUR_NS)) toRemove.push(k)
  }
  toRemove.forEach((k) => ls.removeItem(k))
}

// One-shot copy-and-delete from pre-Phase-75 keys into the new namespace.
// Idempotent: legacy keys not present => no-op; new keys already present => skip overwrite.
export function migrateLegacyKeys(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  const nowIso = new Date().toISOString()

  // Tooltips — snapshot first because we'll be deleting as we go.
  const legacyTooltipKeys: string[] = []
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)
    if (k && k.startsWith(LEGACY_TOOLTIP_PREFIX)) legacyTooltipKeys.push(k)
  }
  for (const lk of legacyTooltipKeys) {
    const short = lk.slice(LEGACY_TOOLTIP_PREFIX.length)
    const target = TOOLTIP_PREFIX + short
    if (!ls.getItem(target)) {
      ls.setItem(target, JSON.stringify({ seen: true, dismissedAt: nowIso }))
    }
    ls.removeItem(lk)
  }

  // Spotlight completed
  if (ls.getItem(LEGACY_COMPLETED_KEY) === "true") {
    if (!ls.getItem(SPOTLIGHT_COMPLETED_KEY)) {
      ls.setItem(
        SPOTLIGHT_COMPLETED_KEY,
        JSON.stringify({ seen: true, dismissedAt: nowIso })
      )
    }
    ls.removeItem(LEGACY_COMPLETED_KEY)
  }

  // Spotlight pending
  if (ls.getItem(LEGACY_PENDING_KEY) === "true") {
    if (!ls.getItem(SPOTLIGHT_PENDING_KEY)) {
      ls.setItem(SPOTLIGHT_PENDING_KEY, JSON.stringify({ pending: true }))
    }
    ls.removeItem(LEGACY_PENDING_KEY)
  }
}
