import type { BrowserContext, Page } from '@playwright/test'

export const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const

export const langs = ['en', 'pt', 'es'] as const
export type Lang = (typeof langs)[number]

export async function freezeAnimations(page: Page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  })
}

export async function setLang(context: BrowserContext, lang: Lang) {
  await context.addCookies([
    { name: 'eb-language', value: lang, domain: 'localhost', path: '/' },
  ])
}
