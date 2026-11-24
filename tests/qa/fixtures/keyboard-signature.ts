import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect } from '../test'

export async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible()
  for (let count = 0; count < 60; count++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Keyboard Tab could not reach the required visible control')
}

export async function observeSignaturePointers(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { __qaSignaturePointers: 0 })
    document.addEventListener('pointerdown', () => {
      const observed = window as Window & { __qaSignaturePointers: number }
      observed.__qaSignaturePointers++
    }, true)
  })
}

export async function typeSignature(page: Page, dialog: Locator, signer: string) {
  await tabTo(page, dialog.getByRole('radio', { name: 'Draw', exact: true }))
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('radio', { name: 'Type', exact: true })).toBeChecked()
  const name = dialog.getByRole('textbox', { name: 'Your full name', exact: true })
  await tabTo(page, name)
  await page.keyboard.type(signer)
  await expect(name).toHaveValue(signer)
}

export async function expectNoSignaturePointer(page: Page) {
  expect(await page.evaluate(() => (window as Window & { __qaSignaturePointers?: number }).__qaSignaturePointers)).toBe(0)
}

export function expectSignaturePng(dataUrl: string) {
  expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  const image = Buffer.from(dataUrl.split(',')[1], 'base64')
  expect(image.subarray(1, 4).toString()).toBe('PNG')
  expect(image.readUInt32BE(16)).toBe(600)
  expect(image.readUInt32BE(20)).toBe(160)
}

export async function auditKeyboardSignature(page: Page, info: TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await info.attach(`${name}-axe.json`, { body: JSON.stringify(results), contentType: 'application/json' })
  expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    .map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
}
