import { expect, test, type BrowserContext } from '@playwright/test'

// These dev fixtures render the actual dashboard cards/list without an account.
test.use({ storageState: { cookies: [], origins: [] } })

async function setLanguage(context: BrowserContext, lang: 'en' | 'pt') {
  await context.addInitScript((language) => {
    localStorage.setItem('language', language)
    // These labels normally come from the translation service. Seed its real
    // browser cache so geometry checks do not depend on an AI/network response.
    localStorage.setItem('xt:i18n:v1:pt', JSON.stringify({
      'Recent projects': 'Projetos recentes',
      'View all': 'Ver todos',
      'Search projects...': 'Pesquisar projetos...',
      'Total Projects': 'Total de projetos',
      'Pending Estimates': 'Estimativas pendentes',
      'Accepted': 'Aceito',
      'Total Revenue': 'Receita total',
      'Welcome back, Vanildo': 'Bem-vindo de volta, Vanildo',
      'Track active projects, monitor estimate health, and start new work.': 'Acompanhe projetos ativos, monitore seus orçamentos e inicie novos trabalhos.',
    }))
  }, lang)
}

test('complete dashboard preview stays compact and within its mobile main', async ({ page, context }, testInfo) => {
  await setLanguage(context, 'pt')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dev/dashboard')
  const greeting = page.getByText('Bem-vindo de volta, Vanildo', { exact: true })
  await expect(greeting).toBeVisible()
  expect(await greeting.evaluate((element) => {
    const style = getComputedStyle(element)
    return { size: style.fontSize, weight: style.fontWeight }
  })).toEqual({ size: '24px', weight: '500' })
  await expect.poll(() => page.locator('main').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await expect(page.locator('[data-variant="stat"]')).toHaveCount(4)
  await page.waitForFunction(() => [...document.querySelectorAll('[data-variant="stat"]')].every((card) => getComputedStyle(card.parentElement!).opacity === '1'))
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png') })
})

for (const lang of ['en', 'pt'] as const) {
  for (const width of [320, 390, 1024, 1440]) {
    test(`dashboard list fits its scrolling main at ${width}px (${lang})`, async ({ page, context }) => {
      await setLanguage(context, lang)
      await page.setViewportSize({ width, height: 844 })
      // Twelve pages reproduce the long page strip, including ellipsis gaps.
      await page.goto('/dev/data-table?stress=1&page=6')
      await expect(page.getByRole('heading', { name: lang === 'pt' ? 'Projetos recentes' : 'Recent projects' })).toBeVisible()
      const next = page.getByRole('button', { name: 'Next page' })
      await expect(next).toBeEnabled()
      const main = page.locator('main')
      await expect.poll(() => main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      await next.click()
      await expect(page).toHaveURL(/page=7/)
      await expect.poll(() => main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      if (width < 768) {
        await expect(page.getByText('7 / 12', { exact: true })).toBeVisible()
      } else {
        await expect(page.getByRole('button', { name: '7', exact: true })).toHaveAttribute('aria-current', 'page')
      }
    })
  }
}

for (const lang of ['en', 'pt'] as const) {
  for (const width of [320, 390, 1440]) {
    test(`dashboard stat values stay within their cards at ${width}px (${lang})`, async ({ page, context }) => {
      await setLanguage(context, lang)
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/dev/stat-cards')
      await expect(page.getByText(lang === 'pt' ? 'Total de projetos' : 'Total Projects', { exact: true }).first()).toBeVisible()
      const cards = page.locator('[data-variant="stat"]')
      await expect(cards).toHaveCount(8)
      const geometry = await cards.evaluateAll((elements) => elements.map((card) => {
        const value = card.querySelector('[data-slot="stat-value"]')!
        const label = card.querySelector('[data-slot="stat-label"]')!
        const cardBounds = card.getBoundingClientRect()
        const labelRange = document.createRange()
        labelRange.selectNodeContents(label)
        const labelText = labelRange.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(value)
        const text = range.getBoundingClientRect()
        const bounds = value.getBoundingClientRect()
        return {
          overflow: card.scrollWidth - card.clientWidth,
          valueFits: text.left >= bounds.left - 1 && text.right <= bounds.right + 1,
          rightAligned: Math.abs(text.right - bounds.right) <= 1,
          labelFits: labelText.left >= cardBounds.left && labelText.right <= cardBounds.right && labelText.top >= cardBounds.top && labelText.bottom <= cardBounds.bottom,
          labelSize: Number.parseFloat(getComputedStyle(label).fontSize),
        }
      }))
      expect(geometry.every(({ overflow, valueFits, rightAligned, labelFits, labelSize }) => overflow <= 1 && valueFits && rightAligned && labelFits && labelSize >= 12)).toBe(true)
    })
  }
}

for (const width of [320, 390]) {
  test(`long stat labels and full amounts remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/dev/stat-cards?stress=1')
    const cards = page.getByTestId('long-stat-cards').locator('[data-variant="stat"]')
    await expect(cards).toHaveCount(2)
    const visibility = await cards.evaluateAll(elements => elements.map(card => {
      const cardBounds = card.getBoundingClientRect()
      return [...card.querySelectorAll('[data-slot="stat-label"], [data-slot="stat-value"]')].every(element => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        const style = getComputedStyle(element)
        return text.left >= cardBounds.left && text.right <= cardBounds.right && text.top >= cardBounds.top && text.bottom <= cardBounds.bottom && element.scrollWidth <= element.clientWidth + 1 && style.textOverflow !== 'ellipsis' && Number.parseFloat(style.fontSize) >= 12
      })
    }))
    expect(visibility).toEqual([true, true])
    await expect(cards.nth(0).locator('[data-slot="stat-value"]')).toHaveText('123456789012')
    await expect(cards.nth(1).locator('[data-slot="stat-value"]')).toHaveText('$1,234,567,890')
  })
}
