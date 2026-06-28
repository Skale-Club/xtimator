import { describe, expect, it } from 'vitest'
import { isUnreportableServerActionMismatch } from '@/lib/observability/sentry-filters'

describe('Sentry server event filters', () => {
  it('drops the exact Next.js Server Action mismatch reported by scanners', () => {
    expect(
      isUnreportableServerActionMismatch({
        transaction: 'POST /page',
        exception: {
          values: [
            {
              value:
                'Failed to find Server Action. This request might be from an older or newer deployment.',
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('keeps unrelated errors on the same transaction', () => {
    expect(
      isUnreportableServerActionMismatch({
        transaction: 'POST /page',
        exception: { values: [{ value: 'Database unavailable' }] },
      }),
    ).toBe(false)
  })

  it('keeps the legacy scanner-only not-found transaction filtered', () => {
    expect(
      isUnreportableServerActionMismatch({
        transaction: 'POST /_not-found/page',
      }),
    ).toBe(true)
  })
})
