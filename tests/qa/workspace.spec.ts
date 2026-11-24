import type { Page } from '@playwright/test'
import { expect, test } from './test'
import { createQaFixture } from './fixtures/tenant'

const DEVELOPMENT_ORIGIN = 'https://prmqgcrnpuvpzruyzvuv.supabase.co'
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
type Tenant = ReturnType<typeof createQaFixture>

async function withTenant(page: Page, baseURL: string, run: (fixture: Tenant) => Promise<void>) {
  const fixture = createQaFixture(baseURL)
  try {
    await fixture.seed()
    await page.context().route('**/*', route => {
      const origin = new URL(route.request().url()).origin
      return origin === baseURL || origin === DEVELOPMENT_ORIGIN ? route.continue() : route.abort('blockedbyclient')
    })
    await page.context().addCookies(fixture.cookies())
    await run(fixture)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
}

test('[QA:PROJECT-CRUD] create a manual project, rename it, and delete the new record only', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    const { projectId, estimateId } = await test.step('Create a project and blank estimate through New Xtimate', async () => {
      const opened = await page.goto('/projects/new')
      expect(opened?.status()).toBe(200)
      expect((await opened?.request().redirectedFrom()?.response())?.status()).toBe(307)
      await expect(page).toHaveURL(url => url.pathname === '/projects' && url.searchParams.get('modal') === 'new-project')
      const wizard = page.getByRole('dialog', { name: 'New Xtimate', exact: true })
      await expect(wizard).toBeVisible()
      await wizard.getByTestId('start-from-scratch-btn').click()
      await expect(page).toHaveURL(url => url.pathname.startsWith('/projects/')
        && UUID.test(url.pathname.slice('/projects/'.length)) && UUID.test(url.searchParams.get('estimate') ?? ''))

      const current = new URL(page.url())
      const projectId = current.pathname.slice('/projects/'.length)
      const estimateId = current.searchParams.get('estimate')!
      expect(projectId).not.toBe(fixture.projectId)
      expect(estimateId).not.toBe(fixture.estimateId)
      expect(await fixture.readOwn('projects', projectId)).toMatchObject({
        company_id: fixture.companyId, name: expect.stringMatching(/^Untitled project/), status: 'draft', total: 0,
      })
      expect(await fixture.readEstimate(estimateId)).toMatchObject({
        company_id: fixture.companyId, project_id: projectId, status: 'draft', is_current: true, total: 0,
      })
      return { projectId, estimateId }
    })

    const projectName = `QA manual project ${projectId.slice(0, 8)}`
    await test.step('Rename the project and recover the saved title after a reload', async () => {
      await page.getByRole('button', { name: 'Rename project', exact: true }).click()
      const name = page.getByRole('textbox', { name: 'Project name', exact: true })
      await name.fill(projectName)
      await name.press('Enter')
      await expect.poll(async () => (await fixture.readOwn('projects', projectId))?.name).toBe(projectName)
      await page.reload()
      await expect(page.getByRole('heading', { level: 1, name: projectName, exact: true })).toBeVisible()
    })

    await test.step('Delete the new project from its list entry', async () => {
      await page.goto('/projects')
      const link = page.locator(`a[href="/projects/${projectId}"][aria-hidden="true"]`)
      const actions = page.getByRole('button', { name: 'Actions', exact: true })
      const entry = info.project.name === 'chromium'
        ? page.getByRole('row').filter({ has: link })
        : link.locator('xpath=..').filter({ has: actions })
      await expect(entry.getByText(projectName, { exact: true })).toBeVisible()
      await entry.getByRole('button', { name: 'Actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
      const confirm = page.getByRole('alertdialog', { name: 'Permanently delete project?', exact: true })
      await expect(confirm).toContainText(projectName)
      await confirm.getByRole('button', { name: 'Delete permanently', exact: true }).click()
      await expect.poll(() => fixture.readOwn('projects', projectId)).toBeNull()
      await expect.poll(() => fixture.readEstimate(estimateId)).toBeNull()
      await expect(page.getByText(projectName, { exact: true })).toHaveCount(0)
      expect(await fixture.readProject()).toMatchObject({ name: fixture.projectName })
      await expect(page.getByText(fixture.projectName, { exact: true }).filter({ visible: true })).toBeVisible()
    })
  })
})

test('[QA:SETTINGS-PERSIST] company display and address changes survive a reload', async ({ page, baseURL }) => {
  await withTenant(page, baseURL!, async fixture => {
    await page.goto('/settings/company')
    // Keep the fixture's generated name prefix so guarded cleanup still owns it.
    const changes = { name: `${fixture.companyName} Updated`, address: '125 QA Test Way', city: 'Boston', state: 'MA', zip: '02108' }
    const company = page.getByPlaceholder('Your Company', { exact: true })
    const street = page.getByPlaceholder('123 Main St', { exact: true })
    const city = page.getByRole('textbox', { name: 'City', exact: true })
    const state = page.getByRole('textbox', { name: 'State', exact: true })
    const zip = page.getByRole('textbox', { name: 'Zip', exact: true })
    await expect(company).toHaveValue(fixture.companyName)
    await company.fill(changes.name)
    await street.fill(changes.address)
    await city.fill(changes.city)
    await state.fill(changes.state)
    await zip.fill(changes.zip)
    await zip.press('Tab')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect.poll(() => fixture.readCompany()).toMatchObject(changes)
    await page.reload()
    await expect(company).toHaveValue(changes.name)
    await expect(street).toHaveValue(changes.address)
    await expect(city).toHaveValue(changes.city)
    await expect(state).toHaveValue(changes.state)
    await expect(zip).toHaveValue(changes.zip)
  })
})

test('[QA:PRICEBOOK-CRUD] create and edit a service and category, then delete both', async ({ page, baseURL }, info) => {
  await withTenant(page, baseURL!, async fixture => {
    const desktop = info.project.name === 'chromium'
    const marker = fixture.companyId.slice(0, 8)
    const itemName = `QA labor ${marker}`
    const updatedItem = `QA labor and prep ${marker}`
    const categoryName = `QA services ${marker}`
    const updatedCategory = `QA project services ${marker}`
    const summary = page.getByTestId('price-book-summary')
    await page.goto('/price-book')

    const itemId = await test.step('Add the first service with a fixed price', async () => {
      expect(await fixture.readPriceBook('item', { name: itemName })).toBeNull()
      await page.getByRole('button', { name: 'Add first item', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Add Service', exact: true })
      await dialog.getByPlaceholder('e.g. General Labor', { exact: true }).fill(itemName)
      const price = dialog.getByPlaceholder('0.00', { exact: true })
      await price.fill('85.50')
      await price.press('Tab')
      await dialog.getByRole('button', { name: 'Add Service', exact: true }).click()
      await expect(summary).toHaveText('1 service · 0 categories')
      const item = await fixture.readPriceBook('item', { name: itemName })
      expect(item).toMatchObject({ name: itemName, unit_price: 85.5, folder_id: null })
      expect(item?.id).toMatch(UUID)
      return item!.id as string
    })

    const categoryId = await test.step('Create a category and put the updated service in it', async () => {
      if (desktop) {
        await page.getByRole('button', { name: 'New Category', exact: true }).click()
      } else {
        await page.getByRole('button', { name: 'More actions', exact: true }).click()
        await page.getByRole('menuitem', { name: 'New Category', exact: true }).click()
      }
      const create = page.getByRole('dialog', { name: 'New Category', exact: true })
      await create.getByPlaceholder('Category name...', { exact: true }).fill(categoryName)
      await create.getByRole('button', { name: 'Create', exact: true }).click()
      await expect(summary).toHaveText('1 service · 1 category')
      const category = await fixture.readPriceBook('category', { name: categoryName })
      expect(category?.id).toMatch(UUID)
      const categoryId = category!.id as string

      await page.getByRole('button', { name: itemName, exact: true }).click()
      const edit = page.getByRole('dialog', { name: 'Edit Service', exact: true })
      await edit.getByRole('combobox').filter({ hasText: 'No folder' }).click()
      await page.getByRole('option', { name: categoryName, exact: true }).click()
      await edit.getByPlaceholder('e.g. General Labor', { exact: true }).fill(updatedItem)
      const price = edit.getByPlaceholder('0.00', { exact: true })
      await price.evaluate(node => {
        const input = node as HTMLInputElement
        const events: Array<Record<string, unknown>> = []
        const record = (type: string, event?: Event) => {
          if (events.length >= 100) return
          events.push({ type, value: input.value, start: input.selectionStart, end: input.selectionEnd,
            focused: document.activeElement === input, connected: input.isConnected,
            trusted: event?.isTrusted ?? null, inputType: (event as InputEvent | undefined)?.inputType ?? null,
            data: (event as InputEvent | undefined)?.data ?? null })
        }
        Object.assign(window, { __qaMoneyReplacement: { input, events, initial: input.value } })
        for (const type of ['focus', 'focusin', 'beforeinput', 'input', 'select', 'blur', 'focusout']) {
          input.addEventListener(type, event => {
            record(type, event)
            queueMicrotask(() => record(`${type}:microtask`))
          })
        }
        document.addEventListener('selectionchange', event => {
          if (document.activeElement === input) record('selectionchange', event)
        })
      })
      await price.fill('129.75')
      await price.press('Tab')
      const replacement = await price.evaluate(node => {
        const diagnostic = (window as Window & { __qaMoneyReplacement?: {
          input: HTMLInputElement; events: Array<Record<string, unknown>>; initial: string
        } }).__qaMoneyReplacement
        return { initial: diagnostic?.initial, current: (node as HTMLInputElement).value,
          sameNode: diagnostic?.input === node, events: diagnostic?.events ?? [] }
      })
      await info.attach('money-replacement-events.json', { body: JSON.stringify(replacement, null, 2), contentType: 'application/json' })
      await expect(price).toHaveValue('129.75')
      await edit.getByRole('button', { name: 'Update Service', exact: true }).click()
      await expect.poll(() => fixture.readPriceBook('item', { id: itemId }))
        .toMatchObject({ name: updatedItem, unit_price: 129.75, folder_id: categoryId })
      return categoryId
    })

    await test.step('Rename the category and verify the saved organization after a reload', async () => {
      const category = page.getByRole('region', { name: categoryName, exact: true })
      await expect(category.getByRole('button', { name: updatedItem, exact: true })).toBeVisible()
      if (desktop) {
        await category.getByRole('button', { name: 'Rename category', exact: true }).click()
      } else {
        await category.getByRole('button', { name: `Category actions: ${categoryName}`, exact: true }).click()
        await page.getByRole('menuitem', { name: 'Rename category', exact: true }).click()
      }
      const name = category.getByRole('textbox')
      await name.fill(updatedCategory)
      await name.press('Enter')
      await expect.poll(() => fixture.readPriceBook('category', { id: categoryId })).toMatchObject({ name: updatedCategory })
      await page.reload()
      const saved = page.getByRole('region', { name: updatedCategory, exact: true })
      await expect(saved.getByRole('button', { name: updatedItem, exact: true })).toBeVisible()
      await expect(saved.getByText('$129.75', { exact: true })).toBeVisible()
    })

    await test.step('Delete the service, then delete its empty category', async () => {
      if (!desktop) await page.getByTestId('category-picker-btn').click()
      await page.getByTestId(`category-filter-${categoryId}`).filter({ visible: true }).click()
      const saved = page.getByRole('region', { name: updatedCategory, exact: true })
      await saved.getByRole('button', { name: updatedItem, exact: true }).click()
      await page.getByRole('dialog', { name: 'Edit Service', exact: true }).getByTestId('price-book-dialog-delete').click()
      const deleteItem = page.getByRole('alertdialog', { name: 'Delete Item', exact: true })
      await expect(deleteItem).toContainText(updatedItem)
      await deleteItem.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect.poll(() => fixture.readPriceBook('item', { id: itemId })).toBeNull()
      await expect(saved.getByText('No services in this category yet.', { exact: true })).toBeVisible()

      if (desktop) {
        await saved.getByTestId(`delete-folder-btn-${categoryId}`).click()
      } else {
        await saved.getByRole('button', { name: `Category actions: ${updatedCategory}`, exact: true }).click()
        await page.getByRole('menuitem', { name: 'Delete category', exact: true }).click()
      }
      const deleteCategory = page.getByRole('alertdialog', { name: 'Delete Category', exact: true })
      await expect(deleteCategory).toContainText('This will delete the empty category.')
      await deleteCategory.getByRole('button', { name: 'Delete Category', exact: true }).click()
      await expect.poll(() => fixture.readPriceBook('category', { id: categoryId })).toBeNull()
      await page.reload()
      await expect(page.getByText('No price book items yet', { exact: true })).toBeVisible()
    })
  })
})
