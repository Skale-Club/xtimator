// tour-flow.spec.ts — Phase 75 Plan 03
//
// Covers TOUR-FIX-02 (no unprompted tooltips, hover-only reveal) and
// TOUR-FIX-05 (ESC dismiss, reduced-motion compatibility) for the rewritten
// tour system from 75-02.
//
// Auth note:
//   The dashboard requires an authenticated session (see tests/e2e/auth.spec.ts
//   "unauthenticated visit to /dashboard redirects to /login"). This spec
//   detects the redirect at the top of each test and calls `test.skip()`
//   with a clear reason — the manual UAT in 75-04 covers the path end-to-end
//   in an authenticated browser. The spec still compiles and is discoverable
//   via `npx playwright test --list`, so it stays in the suite for the day
//   a shared auth fixture lands.
//
// Local storage namespace (Phase 75 — see lib/tour/persistence.ts):
//   xtimator:tour:v1:tooltip:{key}
//   xtimator:tour:v1:spotlight:completed
//   xtimator:tour:v1:spotlight:pending

import { test, expect, type Page } from "@playwright/test"

const TOUR_NS = "xtimator:tour:v1:"

// Pre-Phase-75 legacy keys — wiped too so migration replay doesn't restore
// a "seen" state mid-test.
const LEGACY_KEYS = [
  "tooltip_seen_price_book",
  "tooltip_seen_clients",
  "tooltip_seen_estimate_total",
  "tooltip_seen_whatsapp",
  "tooltip_seen_language_toggle",
  "tour_completed",
  "tour_spotlight_pending",
]

// If `page.goto("/dashboard")` lands us on /?auth=login we're not authenticated.
// With authenticated-state.json populated, the page should not redirect to the LP.
// If it does (e.g., CI without TEST_USER_EMAIL), skip with explanation.
async function requireDashboard(page: Page): Promise<void> {
  if (page.url().includes("auth=login")) {
    test.skip(true, "Auth fixture missing or expired — populate TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.local and re-run `pnpm test:e2e` to generate authenticated-state.json via globalSetup.")
  }
}

test.describe("Tour & Tooltip QA (Phase 75)", () => {
  test.beforeEach(async ({ page }) => {
    // Wipe any cached tour state so each test starts fresh. `addInitScript`
    // runs before every navigation in this test, so the dashboard renders
    // with a clean slate.
    await page.addInitScript(
      ({ ns, legacy }) => {
        try {
          const ls = window.localStorage
          const toRemove: string[] = []
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i)
            if (k && (k.startsWith(ns) || legacy.includes(k))) toRemove.push(k)
          }
          toRemove.forEach((k) => ls.removeItem(k))
        } catch {
          // localStorage may be blocked in some sandbox modes — non-fatal here.
        }
      },
      { ns: TOUR_NS, legacy: LEGACY_KEYS }
    )
  })

  test("TOUR-FIX-02: no tooltip visible on dashboard load", async ({ page }) => {
    await page.goto("/dashboard")
    await requireDashboard(page)
    await page.waitForLoadState("networkidle")

    // Radix tooltips render with role="tooltip" inside a portal when open.
    // 75-02 rewrote ContextualTooltip to require hover/focus — so a fresh
    // dashboard load with zero user interaction must have zero tooltips
    // anywhere in the document.
    const tooltips = page.locator('[role="tooltip"]')
    await expect(tooltips).toHaveCount(0)
  })

  test("TOUR-FIX-02: hovering language toggle reveals its tooltip", async ({ page }) => {
    await page.goto("/dashboard")
    await requireDashboard(page)
    await page.waitForLoadState("networkidle")

    const trigger = page.locator('[data-tour="language-toggle"]').first()
    await expect(trigger).toBeVisible()
    await trigger.hover()

    const tooltip = page.locator('[role="tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 2000 })
  })

  test("TOUR-FIX-02: tooltip hides on hover-away", async ({ page }) => {
    await page.goto("/dashboard")
    await requireDashboard(page)
    await page.waitForLoadState("networkidle")

    const trigger = page.locator('[data-tour="language-toggle"]').first()
    await trigger.hover()
    await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 2000 })

    // Move cursor to the top-left corner — outside both the trigger and the
    // tooltip surface. Radix should close the tooltip after the hover-leave.
    await page.mouse.move(0, 0)
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0, { timeout: 2000 })
  })

  test("TOUR-FIX-05: ESC dismisses the spotlight", async ({ page }) => {
    // Arm the spotlight by setting the pending flag before navigation.
    // TourProvider's mount effect reads this and flips `showSpotlight=true`.
    await page.addInitScript(
      ({ ns }) => {
        try {
          window.localStorage.setItem(
            ns + "spotlight:pending",
            JSON.stringify({ pending: true })
          )
        } catch {
          // noop
        }
      },
      { ns: TOUR_NS }
    )

    await page.goto("/dashboard")
    await requireDashboard(page)
    await page.waitForLoadState("networkidle")

    const spotlight = page.locator('[role="dialog"][aria-label]')
    await expect(spotlight).toBeVisible({ timeout: 5000 })

    await page.keyboard.press("Escape")
    await expect(spotlight).toHaveCount(0, { timeout: 2000 })
  })

  test("TOUR-FIX-05: spotlight functions under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.addInitScript(
      ({ ns }) => {
        try {
          window.localStorage.setItem(
            ns + "spotlight:pending",
            JSON.stringify({ pending: true })
          )
        } catch {
          // noop
        }
      },
      { ns: TOUR_NS }
    )

    await page.goto("/dashboard")
    await requireDashboard(page)
    await page.waitForLoadState("networkidle")

    const spotlight = page.locator('[role="dialog"][aria-label]')
    await expect(spotlight).toBeVisible({ timeout: 5000 })

    // Step through the 5 spotlight steps using the "Next" / "Done" button.
    // The label is i18n and depends on locale, so we click the last button
    // in the card on each step. Under reduced-motion the transition is
    // "none" — clicking should advance immediately.
    for (let i = 0; i < 5; i++) {
      const next = spotlight.getByRole("button").last()
      await next.click()
      await page.waitForTimeout(150) // small settle for state update
    }

    // After 5 clicks (the final being "Done"), the spotlight is gone.
    await expect(spotlight).toHaveCount(0, { timeout: 2000 })
  })

  test("TOUR-QA-03: Tab key cannot reach sidebar/topbar while spotlight is open", async ({ page }) => {
    await page.addInitScript(
      ({ ns }) => {
        try {
          window.localStorage.setItem(ns + 'spotlight:pending', JSON.stringify({ pending: true }))
        } catch {}
      },
      { ns: TOUR_NS }
    )
    await page.goto('/dashboard')
    await requireDashboard(page)
    await page.waitForLoadState('networkidle')

    const spotlight = page.locator('[role="dialog"][aria-label]')
    await expect(spotlight).toBeVisible({ timeout: 5000 })

    // The [data-tour-shell] element should have inert=true while spotlight is open.
    // An inert element cannot receive Tab focus — verify via attribute check.
    const shell = page.locator('[data-tour-shell]')
    await expect(shell).toHaveAttribute('inert', { timeout: 2000 })
  })

  test("TOUR-QA-04: no requestAnimationFrame loop while spotlight is stationary", async ({ page }) => {
    await page.addInitScript(
      ({ ns }) => {
        try {
          window.localStorage.setItem(ns + 'spotlight:pending', JSON.stringify({ pending: true }))
        } catch {}
        // Patch rAF to count calls — if loop runs continuously, count grows unboundedly
        let rafCount = 0
        const orig = window.requestAnimationFrame
        window.requestAnimationFrame = function(cb) {
          rafCount++
          ;(window as unknown as Record<string, unknown>).__rafCount = rafCount
          return orig.call(window, cb)
        }
      },
      { ns: TOUR_NS }
    )
    await page.goto('/dashboard')
    await requireDashboard(page)
    await page.waitForLoadState('networkidle')

    const spotlight = page.locator('[role="dialog"][aria-label]')
    await expect(spotlight).toBeVisible({ timeout: 5000 })

    // Wait 1 second with no interaction
    await page.waitForTimeout(1000)

    const rafCount = await page.evaluate(() => (window as unknown as Record<string, unknown>).__rafCount as number ?? 0)

    // If rAF loop is still running, count would be ~60 (60fps × 1s).
    // autoUpdate fires at most a handful of times on mount + one ResizeObserver check.
    // Allow up to 20 calls as a generous threshold (framer-motion + other libs may use rAF).
    expect(rafCount).toBeLessThan(20)
  })
})
