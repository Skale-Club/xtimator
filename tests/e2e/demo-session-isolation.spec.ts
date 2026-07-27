import { test, expect, type Page } from '@playwright/test'

/**
 * Phase 180 (ENTRY-01..ENTRY-04, SAFE-01, SAFE-02) — isolated demo session &
 * read-only foundation, cross-host Chromium proof.
 *
 * Extended by Phase 181 Plan 04 (PARITY-01..03, CUTOVER-03) with 4 additional
 * test.step()s appended to the SAME test, after Phase 180's steps: real
 * product-surface data-rendering assertions, settings-nav filtering + hidden-tab
 * redirects, mutation-control suppression, and an extra tablet-viewport check.
 * Runs across all 3 configured Playwright projects (chromium/mobile-safari/
 * mobile-chrome) — this is the gate CUTOVER-01 (Plan 05's landing-CTA/dead-code
 * cutover) may not proceed past.
 *
 * Everything below runs in ONE browser context (the default per-test
 * `page`/`context` fixtures Playwright already gives a single test) so the
 * apex-before → demo-excursion → apex-after narrative shares one real cookie
 * jar, exactly like a visitor's browser would.
 *
 * Real routes under test (see .planning/phases/180-.../180-CONTEXT.md D-01..D-12):
 *   - GET  {apexOrigin}/demo/entry            -> 303 to {demoOrigin}/demo/entry (proxy.ts)
 *   - GET  {demoOrigin}/demo/entry            -> establishDemoSession() -> 303 to /dashboard
 *                                                 (lib/demo/session.ts, app/demo/entry/route.ts)
 *   - GET  {demoOrigin}/dashboard             -> real authenticated app shell + DemoBanner
 *   - POST {demoOrigin}/api/notifications/mark-all-read -> demoGuardResponse() 403 (lib/demo/guard.ts)
 *
 * Caveat: `demo.localhost` needs no Playwright/hosts-file configuration —
 * Chromium resolves any `*.localhost` name straight to the loopback address
 * per the reserved-TLD behavior Chrome/Chromium implement, so
 * `http://demo.localhost:9633` "just works" the same way `http://localhost:9633`
 * does. This was verified directly against the dev server while writing this
 * spec.
 *
 * Apex "before" identity: a real login would be the strongest proof, but the
 * landing auth dialog is gated by Cloudflare Turnstile (components/auth/turnstile-widget.tsx),
 * which makes an automated sign-in/sign-up non-deterministic in this suite.
 * Like tests/e2e/notifications.spec.ts and tests/e2e/support-mode.spec.ts, this
 * spec opportunistically logs in with TEST_USER_EMAIL/TEST_USER_PASSWORD when
 * configured (best proof: real `sb-*` auth cookies). When unset, it falls back
 * to a synthetic marker cookie on the apex origin so the isolation assertion
 * (apex cookie jar unchanged by the demo excursion) is still a real, non-vacuous
 * check rather than empty-equals-empty.
 */

const apexOrigin = process.env.PLAYWRIGHT_APEX_ORIGIN ?? 'http://localhost:9633'
const demoOrigin = process.env.DEMO_APP_ORIGIN ?? 'http://demo.localhost:9633'

// Duplicated intentionally: lib/demo/guard.ts is a `server-only` module and
// cannot be imported from a Playwright spec. Keep in sync with that file.
const DEMO_READONLY_MESSAGE = 'This is a read-only demo. Create a free account to make changes.'

type RedirectHop = { url: string; status: number }

/**
 * Walks a completed navigation's redirect chain (oldest -> newest) so tests
 * can assert both the exact hop sequence (apex -> demo host -> /dashboard)
 * and that the chain is bounded (no redirect loop).
 */
async function collectRedirectChain(
  startResponse: Awaited<ReturnType<Page['goto']>>
): Promise<RedirectHop[]> {
  if (!startResponse) return []
  const hops: RedirectHop[] = []
  let current = startResponse.request()
  while (current) {
    const res = await current.response()
    hops.unshift({ url: current.url(), status: res ? res.status() : -1 })
    current = current.redirectedFrom()
  }
  return hops
}

function sortedCookieSnapshot(cookies: { name: string; value: string; domain: string }[]) {
  return [...cookies]
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

test.describe('Demo session isolation (ENTRY-01..04, SAFE-01, SAFE-02)', () => {
  test('apex session survives a full demo excursion; demo host is isolated and read-only', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000)

    // ----------------------------------------------------------------------
    // Phase 0: establish an apex "before" state.
    // ----------------------------------------------------------------------
    await test.step('apex: capture the normal session state before touching demo', async () => {
      const testUserEmail = process.env.TEST_USER_EMAIL
      const testUserPassword = process.env.TEST_USER_PASSWORD

      if (testUserEmail && testUserPassword) {
        await page.goto('/?auth=login')
        await page.waitForSelector('[role="dialog"]')
        await page.fill('input[name="email"]', testUserEmail)
        await page.getByRole('button', { name: /^Continue$/ }).click()
        await page.fill('input[name="password"]', testUserPassword)
        await page.getByRole('button', { name: /^Sign in$/ }).click()
        await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 })
      } else {
        // No real apex user configured for this run — plant a marker cookie so
        // the "apex unchanged after demo" assertion below is meaningful instead
        // of trivially comparing two empty cookie jars.
        await context.addCookies([
          {
            name: 'e2e-apex-marker',
            value: `apex-${Date.now()}`,
            url: apexOrigin,
          },
        ])
      }
    })

    const apexCookiesBefore = sortedCookieSnapshot(await context.cookies(apexOrigin))
    expect(apexCookiesBefore.length).toBeGreaterThan(0)

    // ----------------------------------------------------------------------
    // D-01: apex /demo/entry hands off to the demo host's /demo/entry, which
    // authenticates the dedicated demo user and lands on the REAL /dashboard.
    // ----------------------------------------------------------------------
    await test.step('D-01: apex /demo/entry hands off to demo host /demo/entry -> real /dashboard', async () => {
      const response = await page.goto(`${apexOrigin}/demo/entry`, {
        waitUntil: 'load',
        timeout: 30_000,
      })
      const hops = await collectRedirectChain(response)

      expect(hops.length).toBeGreaterThanOrEqual(2)
      // First hop: the apex handoff itself (no Supabase/auth work — proxy.ts).
      expect(hops[0].url).toBe(`${apexOrigin}/demo/entry`)
      expect(hops[0].status).toBe(303)
      // Somewhere in the chain: the demo host's own /demo/entry establishing
      // (or reusing) the host-only demo session.
      expect(hops.some((h) => h.url === `${demoOrigin}/demo/entry`)).toBe(true)
      // Final hop: the real authenticated dashboard, not a login/onboarding bounce.
      const last = hops[hops.length - 1]
      expect(last.url).toBe(`${demoOrigin}/dashboard`)
      expect(last.status).toBe(200)
      expect(page.url()).toBe(`${demoOrigin}/dashboard`)
    })

    await test.step('demo host reaches the real dashboard, authenticated (not bounced to login)', async () => {
      // The real app shell renders the shared read-only banner for the demo
      // company (app/(app)/layout.tsx: `{isDemo && <DemoBanner />}`).
      await expect(page.getByText(/read-only Xtimator demo/i)).toBeVisible({ timeout: 10_000 })
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/create your free account|sign in/i)
    })

    // ----------------------------------------------------------------------
    // D-02: demo cookies (Supabase auth + active_company_id) are host-only.
    // ----------------------------------------------------------------------
    await test.step('D-02: demo session/company cookies are host-only (scoped to the demo host)', async () => {
      const demoCookies = await context.cookies(demoOrigin)
      const authCookies = demoCookies.filter((c) => c.name.startsWith('sb-'))
      const companyCookie = demoCookies.find((c) => c.name === 'active_company_id')

      expect(authCookies.length).toBeGreaterThan(0)
      expect(companyCookie).toBeDefined()
      expect(companyCookie!.value.length).toBeGreaterThan(0)

      // Host-only: Set-Cookie carried no Domain attribute, so Chromium scopes
      // the cookie to the exact request host, not a shared parent domain.
      for (const cookie of [...authCookies, companyCookie!]) {
        expect(cookie.domain).toBe('demo.localhost')
      }

      // The apex origin must never see these demo-host cookies.
      const apexCookiesDuringDemo = await context.cookies(apexOrigin)
      const leaked = apexCookiesDuringDemo.filter(
        (c) => c.name.startsWith('sb-') || c.name === 'active_company_id'
      )
      expect(leaked).toHaveLength(0)
    })

    // ----------------------------------------------------------------------
    // SAFE-01/SAFE-02: a representative write is denied with no visible effect.
    // ----------------------------------------------------------------------
    await test.step('representative write attempt is blocked read-only, no side effect', async () => {
      // page.request (Playwright's Node-side APIRequestContext) does its own DNS
      // resolution and does not get the OS/browser's special-cased *.localhost ->
      // 127.0.0.1 handling on Windows. Run the fetch inside the real browser
      // context instead — same demo-host cookie jar, real Chromium DNS handling.
      const result = await page.evaluate(async (url) => {
        const res = await fetch(url, { method: 'POST' })
        return { status: res.status, body: await res.json() }
      }, `${demoOrigin}/api/notifications/mark-all-read`)
      expect(result.status).toBe(403)
      expect(result.body).toEqual({ error: 'demo_readonly', message: DEMO_READONLY_MESSAGE })
    })

    // ----------------------------------------------------------------------
    // Return to apex: original identity/session is restored/unaffected.
    // ----------------------------------------------------------------------
    await test.step('apex: original session/company identity is restored after the demo excursion', async () => {
      const apexCookiesAfter = sortedCookieSnapshot(await context.cookies(apexOrigin))
      expect(apexCookiesAfter).toEqual(apexCookiesBefore)

      // Functional proof too, but only when the "before" state was a real
      // session (TEST_USER_EMAIL/PASSWORD configured): the synthetic-marker
      // fallback (see Phase 0) never authenticates the apex origin, so
      // /dashboard legitimately bounces to ?auth=login regardless of the
      // demo excursion — that bounce is not something this run can prove
      // either way without real credentials. The cookie-jar equality check
      // above still gives a real, non-vacuous isolation proof either way.
      if (process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD) {
        const response = await page.goto(`${apexOrigin}/dashboard`, { timeout: 15_000 })
        expect(page.url()).not.toMatch(/auth=login/)
        if (response) expect(response.status()).toBeLessThan(400)
      }
    })

    // ----------------------------------------------------------------------
    // D-03/ENTRY-03: bounded re-entry — valid session reuse never loops.
    // ----------------------------------------------------------------------
    await test.step('bounded re-entry: revisiting /demo/entry reuses the session without looping', async () => {
      const response = await page.goto(`${demoOrigin}/demo/entry`, {
        waitUntil: 'load',
        timeout: 15_000,
      })
      const hops = await collectRedirectChain(response)

      expect(hops.length).toBeLessThanOrEqual(2)
      expect(hops[hops.length - 1].url).toBe(`${demoOrigin}/dashboard`)
      expect(page.url()).toBe(`${demoOrigin}/dashboard`)
    })

    // ----------------------------------------------------------------------
    // D-03/ENTRY-03: partial/stale demo cookie state repairs once, no loop.
    // ----------------------------------------------------------------------
    await test.step('bounded re-entry: stale demo auth cookies repair once and settle on /dashboard', async () => {
      // Simulate a stale/broken demo session: drop the Supabase auth cookies
      // but leave the leftover active_company_id cookie in place (a "partial"
      // demo cookie state per D-03), then re-enter.
      const demoCookies = await context.cookies(demoOrigin)
      const staleAuthCookieNames = demoCookies
        .filter((c) => c.name.startsWith('sb-'))
        .map((c) => c.name)
      expect(staleAuthCookieNames.length).toBeGreaterThan(0)

      for (const name of staleAuthCookieNames) {
        await context.clearCookies({ name, domain: 'demo.localhost' })
      }

      const response = await page.goto(`${demoOrigin}/demo/entry`, {
        waitUntil: 'load',
        timeout: 15_000,
      })
      const hops = await collectRedirectChain(response)

      // Repair happens within the single /demo/entry request/response — the
      // route has exactly one success redirect and no failure redirects
      // (lib/demo/session.ts), so the browser-visible chain stays bounded.
      expect(hops.length).toBeLessThanOrEqual(2)
      expect(hops[hops.length - 1].url).toBe(`${demoOrigin}/dashboard`)
      expect(page.url()).toBe(`${demoOrigin}/dashboard`)
      await expect(page.getByText(/read-only Xtimator demo/i)).toBeVisible({ timeout: 10_000 })

      // Repaired session re-establishes host-only auth cookies.
      const repairedCookies = await context.cookies(demoOrigin)
      expect(repairedCookies.some((c) => c.name.startsWith('sb-'))).toBe(true)
    })

    // ----------------------------------------------------------------------
    // PARITY-01/PARITY-02: core read surfaces render the deterministic demo
    // data (Phase 181 Plans 01-03).
    // ----------------------------------------------------------------------
    await test.step('PARITY-01/02: core read surfaces render the deterministic demo data', async () => {
      // These list surfaces render BOTH a desktop table and a mobile card list,
      // hiding one via CSS at each breakpoint — so a bare `.first()` would pick
      // whichever DOM order puts first, which is the hidden one on phone
      // viewports. `.filter({ visible: true })` asserts against whichever layout
      // this project's viewport actually renders, which is precisely what
      // PARITY-01/02 ("same responsive behavior as a real tenant") means. This
      // spec runs on chromium (desktop), mobile-safari, and mobile-chrome.
      const visibleText = (text: string) =>
        page.getByText(text).filter({ visible: true }).first()

      await page.goto(`${demoOrigin}/dashboard`, { waitUntil: 'load' })
      await expect(page.getByText(/read-only Xtimator demo/i)).toBeVisible({ timeout: 10_000 })

      await page.goto(`${demoOrigin}/clients`, { waitUntil: 'load' })
      await expect(visibleText('Maple Street Residence')).toBeVisible({ timeout: 10_000 })

      await page.goto(`${demoOrigin}/price-book`, { waitUntil: 'load' })
      await expect(visibleText('Carpet cleaning — per room')).toBeVisible({ timeout: 10_000 })

      await page.goto(`${demoOrigin}/projects`, { waitUntil: 'load' })
      await expect(visibleText('Whole-Home Carpet Cleaning')).toBeVisible({ timeout: 10_000 })
      // Project rows/cards use a full-bleed `absolute inset-0` overlay <Link>
      // (components/projects/project-table.tsx) as the real click target, with
      // the visible name text purely decorative on top of it — a native click
      // at the text's coordinates is correctly intercepted by that overlay.
      // `force: true` still dispatches a real browser click at those
      // coordinates, which the overlay link receives, exactly like a user tap.
      await visibleText('Whole-Home Carpet Cleaning').click({ force: true })
      await page.waitForURL(/\/projects\/[0-9a-f-]+/, { timeout: 10_000 })
      await expect(visibleText('Whole-Home Carpet Cleaning')).toBeVisible({ timeout: 10_000 })
    })

    // ----------------------------------------------------------------------
    // PARITY-02: settings nav shows exactly Company/Team/Notifications;
    // hidden tabs redirect (Phase 181 Plans 01 + 03).
    // ----------------------------------------------------------------------
    await test.step('PARITY-02: settings nav shows exactly Company/Team/Notifications; hidden tabs redirect', async () => {
      await page.goto(`${demoOrigin}/settings`, { waitUntil: 'load' })
      await page.waitForURL(`${demoOrigin}/settings/company`, { timeout: 10_000 })

      const nav = page.locator('nav[aria-label="Section navigation"]')
      await expect(nav.getByText('Company', { exact: true })).toBeVisible()
      await expect(nav.getByText('Team', { exact: true })).toBeVisible()
      await expect(nav.getByText('Notifications', { exact: true })).toBeVisible()
      await expect(nav.getByText('Plans', { exact: true })).toHaveCount(0)
      await expect(nav.getByText('Integrations', { exact: true })).toHaveCount(0)
      await expect(nav.getByText('Knowledge', { exact: true })).toHaveCount(0)

      // The hidden-tab guards (Plan 03) call Next's `redirect()` from inside the
      // page component, which — because the settings layout shell has already
      // begun streaming by then — is delivered as a soft redirect in the RSC
      // payload (HTTP 200 + NEXT_REDIRECT) rather than a 307. A real browser
      // follows it, but `page.goto()` resolves on the initial `load`, before the
      // client-side hop completes, so the URL must be awaited — same pattern as
      // the `/settings` -> `/settings/company` hop asserted above.
      // Verified out-of-band that this leaks nothing: the guard throws before
      // any billing query runs, and the pre-redirect payload contains no billing
      // data (no stripe/customer/price ids, no credit balance) and no settings nav.
      await page.goto(`${demoOrigin}/settings/billing`, { waitUntil: 'load' })
      await page.waitForURL(`${demoOrigin}/settings/company`, { timeout: 10_000 })
    })

    // ----------------------------------------------------------------------
    // PARITY-03: mutation controls are suppressed on the exposed demo tabs
    // (Phase 181 Plan 02).
    // ----------------------------------------------------------------------
    await test.step('PARITY-03: mutation controls are suppressed on the exposed demo tabs', async () => {
      await page.goto(`${demoOrigin}/settings/team`, { waitUntil: 'load' })
      await expect(page.getByRole('button', { name: 'Invite' })).toHaveCount(0)

      await page.goto(`${demoOrigin}/settings/notifications`, { waitUntil: 'load' })
      await expect(page.getByTestId('master-email-digest')).toBeDisabled()
      await expect(page.getByTestId('save-prefs')).toBeDisabled()
      await expect(
        page.getByText('This is a read-only demo. Create a free account to manage your notification settings.')
      ).toBeVisible()
    })

    // ----------------------------------------------------------------------
    // CUTOVER-03: demo product renders correctly at an in-between tablet
    // viewport (chromium/mobile-safari/mobile-chrome already cover
    // desktop/phone).
    // ----------------------------------------------------------------------
    await test.step('CUTOVER-03: demo product renders correctly at an in-between tablet viewport', async () => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.goto(`${demoOrigin}/dashboard`, { waitUntil: 'load' })
      await expect(page.getByText(/read-only Xtimator demo/i)).toBeVisible({ timeout: 10_000 })
    })
  })
})
