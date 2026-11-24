import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect, test } from './test'
import { createQaFixture } from './fixtures/tenant'

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

async function audit(page: Page, info: TestInfo, surface: string) {
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
  for (let count = 0; count <= 45; count++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Keyboard Tab did not reach ${label}`)
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
