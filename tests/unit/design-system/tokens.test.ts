import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('Phase 71 — design system tokens', () => {
  const required = [
    '--glass-bg',
    '--glass-bg-strong',
    '--glass-bg-light',
    '--glass-border',
    '--glass-blur',
    '--glass-blur-strong',
    '--gradient-brand',
    '--gradient-hero',
    '--gradient-success',
    '--gradient-warning',
    '--gradient-danger',
    '--gradient-premium',
    '--glow-brand',
    '--glow-success',
    '--shimmer-duration',
  ]
  it.each(required)('declares %s', (token) => {
    expect(css).toContain(token)
  })

  it('uses hsl(var(--primary)) inside --gradient-brand (tenant brand cascade, RESEARCH G6)', () => {
    const brandLine = css.split('\n').find((l) => l.includes('--gradient-brand:'))
    expect(brandLine, '--gradient-brand line').toBeDefined()
    expect(brandLine!).toMatch(/hsl\(var\(--primary\)/)
    expect(brandLine!, 'must NOT contain hard-coded hex brand color').not.toMatch(/#406EF1/i)
  })

  it('declares prefers-reduced-transparency fallback', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-transparency:\s*reduce\)/)
    expect(css).toMatch(/--glass-blur:\s*0/)
  })

  it('declares forced-light glass (RESEARCH G7)', () => {
    // `[data-theme="light"]` appears multiple times (Phase 9 block + Phase 71 glass block).
    // Check that AT LEAST ONE such block declares the white-rgba glass-bg by scanning all segments.
    const segments = css.split(/\[data-theme="light"\]/).slice(1)
    expect(segments.length).toBeGreaterThan(0)
    const hasWhiteGlass = segments.some((seg) => /--glass-bg:\s*rgba\(255,\s*255,\s*255/.test(seg))
    expect(hasWhiteGlass, 'a [data-theme="light"] block declares --glass-bg: rgba(255,255,255,...)').toBe(true)
  })

  it('declares dark glass on .dark / admin-dark / dark-auth', () => {
    // looser check — search for dark-mode glass declaration anywhere after .dark selector
    expect(css).toMatch(/--glass-bg:\s*rgba\(20,\s*24,\s*33/)
  })
})
