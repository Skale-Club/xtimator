/**
 * Shared mock helper for Inngest dispatch tests.
 *
 * Used across:
 *   - tests/unit/api/generate-estimate-dispatch.test.ts
 *   - tests/unit/api/transcribe-dispatch.test.ts
 *   - tests/unit/api/analyze-photos-dispatch.test.ts
 *   - tests/unit/whatsapp/handler-inngest-dispatch.test.ts
 *
 * Returns a vi.fn() spy that resolves to the shape `inngest.send()` returns:
 *   { ids: ['evt_test_xyz'] }
 *
 * Wave 0 (Plan 67-01) ships this helper. Plans 02-05 wire it into actual tests.
 */
import { vi } from 'vitest'

export function mockInngestSend(eventId = 'evt_test_01HWAVEB858VPPX47Z65GR6P6R') {
  return vi.fn().mockResolvedValue({ ids: [eventId] })
}
