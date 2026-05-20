// tests/unit/tour/tooltip-persistence.test.ts
// GREEN suite (Phase 75 Wave 0): exercises lib/tour/persistence.ts directly.
// These tests cover TOUR-FIX-04 (namespaced persistence + restart) and the
// migration helper required to keep existing users from seeing dismissed
// tooltips reappear.

import { describe, it, expect, beforeEach } from "vitest"
import {
  TOUR_NS,
  readTooltipState,
  markTooltipSeen,
  clearAllTourState,
  migrateLegacyKeys,
  isSpotlightCompleted,
  isSpotlightPending,
} from "@/lib/tour/persistence"

beforeEach(() => localStorage.clear())

describe("tooltip persistence", () => {
  it("returns seen:false when no entry", () => {
    expect(readTooltipState("language_toggle")).toEqual({ seen: false })
  })

  it("markTooltipSeen writes namespaced key with ISO timestamp", () => {
    markTooltipSeen("language_toggle")
    const raw = localStorage.getItem(`${TOUR_NS}tooltip:language_toggle`)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.seen).toBe(true)
    expect(typeof parsed.dismissedAt).toBe("string")
    // ISO 8601 sanity
    expect(() => new Date(parsed.dismissedAt).toISOString()).not.toThrow()
    expect(readTooltipState("language_toggle").seen).toBe(true)
  })

  it("clearAllTourState removes only xtimator:tour:v1:* keys", () => {
    markTooltipSeen("clients")
    localStorage.setItem("unrelated", "keep-me")
    clearAllTourState()
    expect(localStorage.getItem(`${TOUR_NS}tooltip:clients`)).toBeNull()
    expect(localStorage.getItem("unrelated")).toBe("keep-me")
  })

  it("migrateLegacyKeys: tooltip_seen_* -> xtimator:tour:v1:tooltip:* and deletes legacy", () => {
    localStorage.setItem("tooltip_seen_language_toggle", "seen")
    migrateLegacyKeys()
    expect(localStorage.getItem("tooltip_seen_language_toggle")).toBeNull()
    expect(readTooltipState("language_toggle").seen).toBe(true)
    const raw = localStorage.getItem(`${TOUR_NS}tooltip:language_toggle`)
    expect(raw).not.toBeNull()
    expect(typeof JSON.parse(raw!).dismissedAt).toBe("string")
  })

  it("migrateLegacyKeys: tour_completed + tour_spotlight_pending -> namespaced", () => {
    localStorage.setItem("tour_completed", "true")
    localStorage.setItem("tour_spotlight_pending", "true")
    migrateLegacyKeys()
    expect(localStorage.getItem("tour_completed")).toBeNull()
    expect(localStorage.getItem("tour_spotlight_pending")).toBeNull()
    expect(isSpotlightCompleted()).toBe(true)
    expect(isSpotlightPending()).toBe(true)
  })

  it("migrateLegacyKeys is idempotent", () => {
    localStorage.setItem("tooltip_seen_clients", "seen")
    migrateLegacyKeys()
    const first = localStorage.getItem(`${TOUR_NS}tooltip:clients`)
    migrateLegacyKeys()
    const second = localStorage.getItem(`${TOUR_NS}tooltip:clients`)
    expect(second).toBe(first)
    // And running it on an empty store does nothing
    localStorage.clear()
    expect(() => migrateLegacyKeys()).not.toThrow()
    expect(localStorage.length).toBe(0)
  })

  it("readTooltipState accepts both long and short key forms", () => {
    markTooltipSeen("language_toggle")
    // The component-side prop is the long form; persistence must normalise.
    expect(readTooltipState("tooltip_seen_language_toggle").seen).toBe(true)
  })
})
