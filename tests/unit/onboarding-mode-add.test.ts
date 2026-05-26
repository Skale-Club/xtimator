// tests/unit/onboarding-mode-add.test.ts
// Phase 81 Plan 03: SWITCH-11 — close the gap where /onboarding?mode=add was
// unreachable from the UI. Static-contract test mirroring Phase 79's pattern.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE_SRC = readFileSync(
  join(process.cwd(), 'app', 'onboarding', 'page.tsx'),
  'utf8'
)
const SURVEY_SRC = readFileSync(
  join(process.cwd(), 'components', 'onboarding', 'onboarding-survey.tsx'),
  'utf8'
)

describe('phase 81 — onboarding ?mode=add wiring (SWITCH-11)', () => {
  it('app/onboarding/page.tsx types searchParams as a Promise (Next.js 16 async)', () => {
    expect(PAGE_SRC).toMatch(
      /searchParams\s*:\s*Promise<\s*\{\s*mode\?:\s*string/
    )
  })

  it('app/onboarding/page.tsx awaits searchParams before destructuring', () => {
    expect(PAGE_SRC).toMatch(/await\s+searchParams/)
  })

  it('app/onboarding/page.tsx passes mode prop to <OnboardingSurvey />', () => {
    expect(PAGE_SRC).toMatch(/<OnboardingSurvey[\s\S]*?\bmode=/)
  })

  it("OnboardingSurvey accepts mode prop typed as 'first' | 'add'", () => {
    expect(SURVEY_SRC).toMatch(
      /mode\?:\s*['"]first['"]\s*\|\s*['"]add['"]/
    )
  })

  it('OnboardingSurvey threads { mode } as second arg to createOrUpdateCompany', () => {
    expect(SURVEY_SRC).toMatch(
      /createOrUpdateCompany\([\s\S]*?,\s*\{[\s\S]*?\bmode\b/
    )
  })
})
