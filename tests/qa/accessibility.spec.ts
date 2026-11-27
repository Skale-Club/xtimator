import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './test'
import { createQaFixture } from './fixtures/tenant'
import { focusTraversalKey } from './fixtures/keyboard-navigation'
import { createQaOnboardingFixture } from './fixtures/onboarding'
import { expectNoSignaturePointer, observeSignaturePointers } from './fixtures/keyboard-signature'

const WCAG_RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
type Tenant = ReturnType<typeof createQaFixture>

async function withTenant(page: Page, baseURL: string, run: (fixture: Tenant) => Promise<void>) {
  const fixture = createQaFixture(baseURL)
  try {
    await fixture.seed()
    await run(fixture)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
}

/**
 * Entrance animations (CSS/WAAPI fades and script-driven inline opacity) make axe measure
 * half-transparent text. Wait until finite animations finish and inline styles stop changing,
 * so contrast is judged on what the user sees once the screen settles.
 */
async function settleAnimations(page: Page) {
  await page.waitForFunction(async () => {
    // A class-driven CSS transition starts on the next frame; let two frames pass before sampling.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const running = document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming()
      return animation.playState === 'running' && timing?.iterations !== Infinity
    })
    if (running.length) return false
    const sample = () => Array.from(document.querySelectorAll<HTMLElement>('[style*="opacity"],[style*="transform"]'),
      element => `${element.style.opacity}|${element.style.transform}`).join(',')
    const before = sample()
    await new Promise(resolve => setTimeout(resolve, 150))
    return sample() === before && !document.getAnimations().some(animation => animation.playState === 'running'
      && animation.effect?.getComputedTiming().iterations !== Infinity)
  }, undefined, { timeout: 15_000, polling: 250 })
}

async function audit(page: Page, info: TestInfo, surface: string) {
  await settleAnimations(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG_RULE_TAGS).analyze()
  const impact = { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 }
  for (const violation of results.violations) impact[violation.impact ?? 'unclassified']++
  await info.attach(`${surface}-axe.json`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  await info.attach(`${surface}-axe-impact.json`, {
    body: JSON.stringify({ surface, impact, incompleteRules: results.incomplete.length }, null, 2),
    contentType: 'application/json',
  })
  info.annotations.push({ type: 'axe-impact', description: `${surface} ${JSON.stringify(impact)}` })
  if (impact.moderate || impact.minor || impact.unclassified || results.incomplete.length) {
    info.annotations.push({
      type: 'accessibility-risk',
      description: `${surface} has ${impact.moderate} moderate, ${impact.minor} minor, ${impact.unclassified} unclassified and ${results.incomplete.length} incomplete rule results requiring review.`,
    })
  }
  const blocking = results.violations
    .filter(violation => violation.impact === 'critical' || violation.impact === 'serious')
    .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(node => node.target) }))
  expect.soft(blocking, `${surface} must have zero serious or critical violations in the selected WCAG rules`).toEqual([])
}

async function noHorizontalOverflow(page: Page, surface: string, dialog?: Locator) {
  const widths = await page.evaluate(() => {
    const root = document.documentElement
    const main = document.querySelector('main')
    return { document: root.scrollWidth - root.clientWidth, main: main ? main.scrollWidth - main.clientWidth : 0 }
  })
  expect.soft(widths.document, `${surface} document horizontal overflow`).toBeLessThanOrEqual(1)
  expect.soft(widths.main, `${surface} main horizontal overflow`).toBeLessThanOrEqual(1)
  if (dialog) {
    const overflow = await dialog.evaluate(element => element.scrollWidth - element.clientWidth)
    expect.soft(overflow, `${surface} dialog horizontal overflow`).toBeLessThanOrEqual(1)
  }
}

test('[QA:AXE-WORKSPACE] dashboard, clients and project editor have named controls and no major axe violations', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    await page.context().addCookies(fixture.cookies())
    await test.step('Scan the account dashboard', async () => {
      expect((await page.goto('/dashboard'))?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      await expect(page.getByText('Total Projects', { exact: true })).toBeVisible()
      await expect(page.getByText(fixture.projectName, { exact: true }).filter({ visible: true })).toBeVisible()
      await expect.soft(page.getByRole('button', { name: 'New Xtimate', exact: true })).toBeVisible()
      await noHorizontalOverflow(page, 'dashboard')
      await audit(page, info, 'dashboard')
    })

    await test.step('Scan the populated Clients page', async () => {
      expect((await page.goto('/clients'))?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
      await expect(page.getByText(fixture.clientName, { exact: true }).filter({ visible: true })).toBeVisible()
      await expect.soft(page.getByRole('button', { name: 'Add Client', exact: true })).toBeVisible()
      await expect.soft(page.getByRole('searchbox', { name: 'Search clients', exact: true })).toBeVisible()
      await noHorizontalOverflow(page, 'clients')
      await audit(page, info, 'clients')
    })

    await test.step('Scan the loaded project editor and its dock', async () => {
      expect((await page.goto(`/projects/${fixture.projectId}`))?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1, name: fixture.projectName, exact: true })).toBeVisible()
      const dock = page.getByTestId('editor-dock')
      await expect(dock).toBeVisible()
      await expect.soft(page.getByRole('button', { name: 'Rename project', exact: true })).toBeVisible()
      await expect.soft(dock.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
      await expect.soft(dock.getByTestId('edit-with-ai-btn')).toHaveAccessibleName(/^(Edit with AI|AI edit)$/)
      await noHorizontalOverflow(page, 'project-editor')
      await audit(page, info, 'project-editor')
    })
  })
})

test('[QA:AXE-PUBLIC] anonymous estimate and signing dialog expose named controls and no major axe violations', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    expect((await page.goto(`/estimate/${fixture.shareToken}`))?.status()).toBe(200)
    await expect(page.getByText(fixture.lineDescription, { exact: true }).filter({ visible: true })).toBeVisible()
    const accept = info.project.name === 'chromium'
      ? page.getByTestId('proposal-bar').getByRole('button', { name: 'Accept', exact: true })
      : page.getByTestId('mobile-accept-bar').getByRole('button', { name: 'Accept Estimate', exact: true })
    await expect.soft(accept).toBeVisible()
    await noHorizontalOverflow(page, 'public-estimate')
    await audit(page, info, 'public-estimate')

    await accept.click()
    const dialog = page.getByRole('dialog', { name: 'Sign to accept this estimate', exact: true })
    await expect(dialog).toBeVisible()
    await expect.soft(dialog.getByRole('textbox', { name: 'Your full name', exact: true })).toBeVisible()
    await expect.soft(dialog.getByRole('textbox', { name: 'Email (optional)', exact: true })).toBeVisible()
    await expect.soft(dialog.getByRole('button', { name: 'Sign & Accept Estimate', exact: true })).toBeDisabled()
    await expect.soft(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await noHorizontalOverflow(page, 'signature-dialog', dialog)
    await audit(page, info, 'signature-dialog')
  })
})

async function tabTo(page: Page, target: Locator, label: string) {
  await expect(target).toBeVisible()
  const key = focusTraversalKey(process.platform, page.context().browser()?.browserType().name(), process.env.XTIMATOR_QA_FULL_KEYBOARD_NAVIGATION === '1')
  for (let count = 0; count <= 45; count++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press(key)
  }
  throw new Error(`Keyboard navigation did not reach ${label}`)
}

test('[QA:KEYBOARD-CLIENT] Tab and Enter open Add Client, report required input and restore focus on Escape', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto('/clients'))?.status()).toBe(200)
    const add = page.getByRole('button', { name: 'Add Client', exact: true })
    await tabTo(page, add, 'Add Client')
    await expect(add).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Add Client', exact: true })
    await expect(dialog).toBeVisible()
    const name = dialog.getByRole('textbox', { name: /^Name\s*\*?$/ })
    await expect(name).toHaveAccessibleName(/^Name\s*\*?$/)
    await expect(name).toHaveAttribute('aria-required', 'true')
    await expect(name).toHaveAttribute('aria-invalid', 'false')
    await tabTo(page, name, 'required client name')
    await expect(name).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription('Client name is required')
    await expect(dialog.getByText('Client name is required', { exact: true })).toBeVisible()
    await expect(name).toBeFocused()
    await noHorizontalOverflow(page, 'client-dialog', dialog)
    await audit(page, info, 'client-dialog-invalid-name')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(add).toBeFocused()
    await noHorizontalOverflow(page, 'clients-after-dialog')
  })
})

test('[QA:AXE-LANDING] anonymous landing page with its consent banner and sign-up dialog, and the sign-in page, have no major axe violations', async ({ page }, info) => {
  try {
    await test.step('Scan the landing page with the cookie consent banner open', async () => {
      expect((await page.goto('/'))?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      // A fresh browser context has no stored consent, so the banner is part of what a first visitor sees.
      const consent = page.getByTestId('cookie-consent')
      await expect(consent).toBeVisible()
      await expect.soft(consent.getByRole('button', { name: 'Accept', exact: true })).toBeVisible()
      await expect.soft(consent.getByRole('button', { name: 'Reject', exact: true })).toBeVisible()
      await noHorizontalOverflow(page, 'landing')
      await audit(page, info, 'landing-consent-banner')
    })

    await test.step('Scan the landing page with the sign-up dialog open', async () => {
      // The landing header has no hamburger menu at any width: its only control is the sign-up call to action.
      // Named: the consent banner is also role=dialog and re-enters the tree once Radix closes this one.
      const dialog = page.getByRole('dialog', { name: /^Sign in to / })
      // The landing page's own deep link (?auth=signup, used by CTAs and emails) opens the
      // on-demand dialog without depending on which header CTA the configured content renders.
      expect((await page.goto('/?auth=signup'))?.status()).toBe(200)
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await expect(dialog).toHaveAccessibleName(/\S/)
      await expect.soft(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
      await audit(page, info, 'landing-auth-dialog')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    })

    await test.step('Scan the sign-in page', async () => {
      expect((await page.goto('/login'))?.status()).toBe(200)
      await expect(page.getByRole('heading', { name: /^Sign in to / }).first()).toBeVisible()
      await expect.soft(page.getByLabel('Phone number', { exact: true })).toBeVisible()
      await expect.soft(page.getByRole('button', { name: 'Send code', exact: true })).toBeVisible()
      await noHorizontalOverflow(page, 'login')
      await audit(page, info, 'login')
    })
  } finally {
    await page.close()
  }
})

test('[QA:AXE-ONBOARDING] a new owned-identity user sees accessible language, company and industry onboarding steps', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaOnboardingFixture(baseURL!)
  try {
    await fixture.seed()
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto('/onboarding'))?.status()).toBe(200)
    const next = page.getByRole('button', { name: 'Next', exact: true })

    await test.step('Scan the language step', async () => {
      await expect(page.getByRole('heading', { name: 'Which language would you like to use Xtimator in?', exact: true })).toBeVisible()
      await expect.soft(next).toBeVisible()
      await noHorizontalOverflow(page, 'onboarding-language')
      await audit(page, info, 'onboarding-language')
    })

    await test.step('Scan the company name step', async () => {
      await next.click()
      const name = page.getByRole('textbox', { name: 'Company Name', exact: true })
      await expect(name).toBeVisible()
      await name.fill(fixture.companyName)
      await noHorizontalOverflow(page, 'onboarding-company')
      await audit(page, info, 'onboarding-company')
    })

    await test.step('Scan the industry step', async () => {
      await next.click()
      await expect(page.getByRole('heading', { name: "What's your phone number?", exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Skip', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Which services does your business offer?', exact: true })).toBeVisible()
      await noHorizontalOverflow(page, 'onboarding-industry')
      await audit(page, info, 'onboarding-industry')
    })
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
})

/** Tab (or Shift+Tab) until the target owns focus, using the same WebKit-aware key as the other keyboard journeys. */
async function reachByKeyboard(page: Page, target: Locator, label: string, { reverse = false, limit = 200, link = false } = {}) {
  await expect(target).toBeVisible()
  // Full keyboard access covers controls only; Safari reaches links with Option+Tab
  // ("Press Tab to highlight each item" is a separate, default-off preference).
  const base = link && page.context().browser()?.browserType().name() === 'webkit' ? 'Alt+Tab' : traversalKey(page)
  const key = reverse ? `Shift+${base}` : base
  for (let count = 0; count <= limit; count++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press(key)
  }
  throw new Error(`Keyboard navigation did not reach ${label}`)
}

function traversalKey(page: Page) {
  return focusTraversalKey(process.platform, page.context().browser()?.browserType().name(), process.env.XTIMATOR_QA_FULL_KEYBOARD_NAVIGATION === '1')
}

async function expectVisibleFocusIndicator(page: Page, label: string) {
  const indicator = await page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    const drawn = (node: Element) => {
      const style = getComputedStyle(node)
      const outline = (style.outlineStyle === 'auto' || (style.outlineStyle !== 'none' && style.outlineStyle !== 'hidden' && parseFloat(style.outlineWidth) > 0))
        && style.outlineColor !== 'rgba(0, 0, 0, 0)' && style.outlineColor !== 'transparent'
      return { outline, shadow: style.boxShadow !== 'none' && style.boxShadow !== '' }
    }
    const own = drawn(element)
    // A field may draw its ring on the wrapper through :focus-within (e.g. stepper inputs).
    let wrapper = { outline: false, shadow: false }
    for (let node = element.parentElement, depth = 0; node && depth < 3 && !wrapper.outline && !wrapper.shadow; node = node.parentElement, depth++) {
      if (node.matches(':focus-within')) wrapper = drawn(node)
    }
    return { tag: element.tagName.toLowerCase(), outline: own.outline || wrapper.outline, shadow: own.shadow || wrapper.shadow }
  })
  expect(indicator, `${label} must own focus`).not.toBeNull()
  expect(indicator!.outline || indicator!.shadow, `${label} (<${indicator!.tag}>) must show a focus outline or ring`).toBe(true)
}

test('[QA:KEYBOARD-WORKSPACE-NAV] Tab and Enter move between the dashboard, clients and a project with visible focus and no trap', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const desktop = info.project.name === 'chromium'
  await withTenant(page, baseURL!, async fixture => {
    await observeSignaturePointers(page)
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto('/dashboard'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    // Desktop shows the sidebar; widths below the md breakpoint show the bottom bar instead.
    const navigation = desktop ? page.getByTestId('app-sidebar') : page.getByTestId('bottom-nav')
    const link = (name: string) => navigation.getByRole('link', { name, exact: true })

    await test.step('Reach Clients in the main navigation and open it', async () => {
      await reachByKeyboard(page, link('Clients'), 'the Clients navigation link', { link: true })
      await expectVisibleFocusIndicator(page, 'Clients navigation link')
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/clients$/)
      await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible()
      await expect(link('Clients')).toHaveAttribute('aria-current', 'page')
    })

    await test.step('Go back to the dashboard with Shift+Tab and Enter', async () => {
      await reachByKeyboard(page, link('Dashboard'), 'the Dashboard navigation link', { reverse: true, link: true })
      await expectVisibleFocusIndicator(page, 'Dashboard navigation link')
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    })

    await test.step('Open the project row menu, leave it with Tab after Escape, then open the project', async () => {
      // Start from the top of a fresh document so the key presses below are the only way focus moves.
      expect((await page.goto('/dashboard'))?.status()).toBe(200)
      await expect(page.getByText(fixture.projectName, { exact: true }).filter({ visible: true })).toBeVisible()
      const actions = page.getByRole('button', { name: 'Actions', exact: true })
      const menu = page.getByRole('menu')
      await reachByKeyboard(page, actions, 'the project Actions button')
      await expectVisibleFocusIndicator(page, 'project Actions button')
      await page.keyboard.press('Enter')
      await expect(menu).toBeVisible()
      expect(await menu.evaluate(element => element.contains(document.activeElement)), 'focus moves into the opened menu').toBe(true)

      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(actions).toBeFocused()
      await page.keyboard.press(traversalKey(page))
      expect(await actions.evaluate(element => element === document.activeElement), 'Tab leaves the control after the menu closes').toBe(false)
      await reachByKeyboard(page, actions, 'the project Actions button again', { reverse: true, limit: 5 })

      await page.keyboard.press('Enter')
      await expect(menu).toBeVisible()
      const view = page.getByRole('menuitem', { name: 'View', exact: true })
      // Radix moves focus into the menu a frame after it opens; arrow keys pressed before that land on the trigger.
      await expect.poll(() => menu.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await expect(async () => {
        if (!await view.evaluate(element => element === document.activeElement)) await page.keyboard.press('ArrowDown')
        await expect(view).toBeFocused({ timeout: 500 })
      }).toPass({ timeout: 10_000 })
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}$`))
      await expect(page.getByRole('heading', { level: 1, name: fixture.projectName, exact: true })).toBeVisible()
    })
    await expectNoSignaturePointer(page)
  })
})

test('[QA:KEYBOARD-ESTIMATE-EDIT] a line item quantity is changed with the keyboard alone and persists', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const desktop = info.project.name === 'chromium'
  await withTenant(page, baseURL!, async fixture => {
    await observeSignaturePointers(page)
    await page.context().addCookies(fixture.cookies())
    expect((await page.goto(`/projects/${fixture.projectId}`))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: fixture.projectName, exact: true })).toBeVisible()
    const row = page.locator(`[${desktop ? 'data-item-id' : 'data-mobile-item-id'}="${fixture.itemId}"]`).filter({ visible: true })
    const sheet = page.getByTestId('item-editor-sheet')
    let quantity: Locator
    if (desktop) {
      quantity = row.getByRole('spinbutton', { name: 'Qty', exact: true })
    } else {
      // Phones edit a line in a sheet that the item's Edit button opens.
      const edit = row.getByRole('button', { name: /^Edit item:/ }).filter({ hasText: fixture.lineDescription })
      await reachByKeyboard(page, edit, 'the line item Edit button')
      await expectVisibleFocusIndicator(page, 'line item Edit button')
      await page.keyboard.press('Enter')
      await expect(sheet).toBeVisible()
      quantity = sheet.getByRole('spinbutton', { name: 'Quantity', exact: true })
    }
    await expect(quantity).toHaveValue('2')
    await reachByKeyboard(page, quantity, 'the quantity field')
    await expectVisibleFocusIndicator(page, 'quantity field')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('3')
    await expect(quantity).toHaveValue('3')
    await page.keyboard.press('Tab')
    if (!desktop) {
      const done = sheet.getByRole('button', { name: 'Done', exact: true })
      await reachByKeyboard(page, done, 'the Done button', { limit: 30 })
      await page.keyboard.press('Enter')
      await expect(sheet).toHaveCount(0)
    }

    await expect.poll(async () => (await fixture.readOwn('estimate_items', fixture.itemId))?.quantity, { timeout: 20_000 }).toBe(3)
    expect(await fixture.readOwn('estimate_items', fixture.itemId)).toMatchObject({ description: fixture.lineDescription, quantity: 3, unit_price: 500, total: 1500 })
    await expect.poll(async () => (await fixture.readProject())?.total, { timeout: 20_000 }).toBe(1500)
    await expectNoSignaturePointer(page)
    if (desktop) {
      expect((await page.reload())?.status()).toBe(200)
      await expect(row.getByRole('spinbutton', { name: 'Qty', exact: true })).toHaveValue('3')
    }
  })
})
