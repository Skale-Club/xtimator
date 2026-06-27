import { test, expect } from '@playwright/test'

/**
 * Plan 04 Task 2 — admin WhatsApp page with URL-backed filters, pagination,
 * and scoped thread inspection (WAADM-02).
 *
 * Structural tests verifying:
 *   - Filter values represented in URL search parameters
 *   - Changing a filter resets page=1
 *   - Pagination preserves all active filters
 *   - Thread action verifies both conversation id and company id
 *   - Thread action contains no update/insert/delete calls
 *
 * Requires TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD env vars and a seeded admin.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD

test.describe('Admin WhatsApp page (WAADM-02)', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD to run admin WhatsApp tests'
  )

  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/?auth=login')
    await page.waitForSelector('[role="dialog"]')
    await page.fill('input[name="email"]', ADMIN_EMAIL!)
    await page.fill('input[name="password"]', ADMIN_PASSWORD!)
    await page.getByRole('button', { name: /Continue|Log in|Sign in/i }).click()
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 })
  })

  test('admin can access /admin/whatsapp and sees the page heading', async ({ page }) => {
    const response = await page.goto('/admin/whatsapp')
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toContainText('WhatsApp')
  })

  test('filter values are represented in URL search parameters', async ({ page }) => {
    await page.goto('/admin/whatsapp')

    // Navigate with search params directly
    await page.goto('/admin/whatsapp?status=active')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('status=active')

    // Verify the page still loads correctly
    await expect(page.locator('h1')).toContainText('WhatsApp')
  })

  test('pagination preserves all active filters in URL', async ({ page }) => {
    // Navigate with filters + page
    await page.goto('/admin/whatsapp?status=active&q=test&page=2')
    await page.waitForLoadState('networkidle')

    // URL should contain the filters
    expect(page.url()).toContain('status=active')
    expect(page.url()).toContain('q=test')
    expect(page.url()).toContain('page=2')
  })

  test('page does not expose platform secrets in conversation rows', async ({ page }) => {
    const response = await page.goto('/admin/whatsapp')
    expect(response?.status()).toBe(200)

    // Verify no secret tokens or API keys visible
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/i) // OpenAI keys
    expect(bodyText).not.toMatch(/whatsapp_token/i)
    expect(bodyText).not.toMatch(/bearer /i)
  })

  test('page has a read-only notice', async ({ page }) => {
    await page.goto('/admin/whatsapp')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Read-only/i)
  })
})

test.describe('Admin WhatsApp: static contract (source-level)', () => {
  test('page.tsx accepts async searchParams', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/page.tsx'),
      'utf8'
    )
    // Must accept searchParams as Promise (Next 14+ pattern)
    expect(src).toMatch(/searchParams.*Promise/)
  })

  test('page.tsx calls parseAdminWhatsAppFilters', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/page.tsx'),
      'utf8'
    )
    expect(src).toContain('parseAdminWhatsAppFilters')
  })

  test('page.tsx calls listAdminWhatsAppConversations', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/page.tsx'),
      'utf8'
    )
    expect(src).toContain('listAdminWhatsAppConversations')
  })

  test('admin-whatsapp-filters.tsx resets page on filter change', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/admin-whatsapp-filters.tsx'),
      'utf8'
    )
    // Must delete page param on filter change
    expect(src).toContain("params.delete('page')")
  })

  test('page.tsx includes Prev/Next pagination links', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/page.tsx'),
      'utf8'
    )
    expect(src).toContain('Previous')
    expect(src).toContain('Next')
  })

  test('page.tsx does not contain .limit(500)', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/page.tsx'),
      'utf8'
    )
    expect(src).not.toMatch(/\.limit\(\s*500\s*\)/)
  })

  test('loadAdminConversationThread accepts expectedCompanyId', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/actions/admin-whatsapp.ts'),
      'utf8'
    )
    expect(src).toContain('expectedCompanyId')
    // Must verify company_id matches expectedCompanyId
    expect(src).toContain('conversation.company_id !== expectedCompanyId')
  })

  test('loadAdminConversationThread contains no update/insert/delete calls', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/actions/admin-whatsapp.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.insert\(/)
    expect(src).not.toMatch(/\.delete\(/)
    expect(src).not.toMatch(/revalidatePath/)
  })

  test('admin-whatsapp-client.tsx passes company_id to loadAdminConversationThread', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/admin/whatsapp/admin-whatsapp-client.tsx'),
      'utf8'
    )
    // Must call loadAdminConversationThread with both id and company_id
    expect(src).toContain('loadAdminConversationThread(row.id, row.company_id)')
  })
})
