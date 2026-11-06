import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const page = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')
const survey = readFileSync(join(process.cwd(), 'components/onboarding/onboarding-survey.tsx'), 'utf8')
const action = readFileSync(join(process.cwd(), 'lib/actions/onboarding-draft.ts'), 'utf8')
describe('onboarding route and completion wiring', () => {
  it('awaits the Next.js search params', () => { expect(page).toMatch(/searchParams\s*:\s*Promise/); expect(page).toMatch(/await searchParams/) })
  it('passes the account draft and mode into the survey', () => { expect(page).toMatch(/draft=\{draft\}/); expect(page).toMatch(/mode=\{addMode\}/) })
  it('completes the durable draft through the server wrapper', () => { expect(survey).toMatch(/completeOnboarding\(payload\)/); expect(action).toMatch(/mode: body.data.mode/) })
})
