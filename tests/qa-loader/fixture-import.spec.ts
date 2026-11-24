import { expect, test } from '@playwright/test'
import { createQaFixture } from '../qa/fixtures/tenant'
import { createQaOnboardingFixture } from '../qa/fixtures/onboarding'

test('owned fixtures load in the Playwright worker without starting the app or opening a browser', () => {
  expect(typeof createQaFixture).toBe('function')
  expect(typeof createQaOnboardingFixture).toBe('function')
})
