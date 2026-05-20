// tests/unit/tour/tour-state-machine.test.ts
//
// RED suite (Phase 75 Wave 0).
// Expected failures today; turns GREEN in 75-02 when use-tour.ts is migrated to
// lib/tour/persistence. See `.planning/phases/75-tour-and-tooltip-qa/75-RESEARCH.md`
// gotcha #2 for the state machine bug being fixed:
//   `startTour()` currently calls `completeTour()` in the same breath, which writes
//   `tour_completed=true` AND `tour_spotlight_pending=true` simultaneously and uses
//   the legacy flat keys. The new state machine MUST:
//     - separate startTour from completeTour
//     - write only into the xtimator:tour:v1:* namespace
//     - never leave a legacy `tour_*` key behind

import { describe, it, expect, beforeEach } from "vitest"
import {
  TOUR_NS,
  clearAllTourState,
  isSpotlightCompleted,
  isSpotlightPending,
} from "@/lib/tour/persistence"
import { useTour } from "@/components/tour/use-tour"

beforeEach(() => localStorage.clear())

describe("tour state machine (post-75-02)", () => {
  it("fresh user is not completed", () => {
    const t = useTour()
    expect(t.isTourCompleted()).toBe(false)
  })

  it("startTour() sets pending and does NOT mark completed (RESEARCH gotcha #2)", () => {
    const t = useTour()
    t.startTour()
    expect(t.isSpotlightPending()).toBe(true)
    expect(t.isTourCompleted()).toBe(false)
  })

  it("isSpotlightPending() reflects startTour()", () => {
    const t = useTour()
    expect(t.isSpotlightPending()).toBe(false)
    t.startTour()
    expect(t.isSpotlightPending()).toBe(true)
  })

  it("completeTour() marks completed and clears pending", () => {
    const t = useTour()
    t.startTour()
    t.completeTour()
    expect(t.isTourCompleted()).toBe(true)
    expect(t.isSpotlightPending()).toBe(false)
  })

  it("clearSpotlightPending() leaves completed untouched", () => {
    const t = useTour()
    t.completeTour()
    t.startTour()
    t.clearSpotlightPending()
    expect(t.isSpotlightPending()).toBe(false)
    expect(t.isTourCompleted()).toBe(true)
  })

  it("re-startTour after completion re-arms pending and resets completed", () => {
    const t = useTour()
    t.completeTour()
    t.startTour()
    expect(t.isSpotlightPending()).toBe(true)
    expect(t.isTourCompleted()).toBe(false)
  })

  it("clearAllTourState() returns user to fresh", () => {
    const t = useTour()
    t.startTour()
    t.completeTour()
    clearAllTourState()
    expect(t.isTourCompleted()).toBe(false)
    expect(t.isSpotlightPending()).toBe(false)
  })

  it("no legacy keys are ever written by the new state machine", () => {
    const t = useTour()
    t.startTour()
    t.completeTour()
    expect(localStorage.getItem("tour_completed")).toBeNull()
    expect(localStorage.getItem("tour_spotlight_pending")).toBeNull()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) expect(k.startsWith(TOUR_NS)).toBe(true)
    }
  })

  it("namespaced spotlight helpers reflect state after startTour/completeTour", () => {
    const t = useTour()
    t.startTour()
    expect(isSpotlightPending()).toBe(true)
    t.completeTour()
    expect(isSpotlightCompleted()).toBe(true)
  })
})
