import { describe, expect, it } from 'vitest'
import {
  isBenignDomMutationError,
  isUnreportableRootPageFormDataProbe,
  isUnreportableServerActionMismatch,
} from '@/lib/observability/sentry-filters'

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

describe('isBenignDomMutationError (XTIMATOR-6)', () => {
  it('drops the removeChild NotFoundError caused by browser translation', () => {
    expect(
      isBenignDomMutationError({
        transaction: 'GET /settings/company',
        exception: {
          values: [
            {
              value:
                "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('drops the analogous insertBefore NotFoundError variant', () => {
    expect(
      isBenignDomMutationError({
        exception: {
          values: [
            {
              value:
                "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('keeps unrelated DOM/runtime errors reportable', () => {
    expect(
      isBenignDomMutationError({
        exception: { values: [{ value: 'TypeError: Cannot read properties of undefined' }] },
      }),
    ).toBe(false)
  })

  it('keeps events with no exception values reportable', () => {
    expect(isBenignDomMutationError({ transaction: 'GET /settings/company' })).toBe(false)
  })
})

describe('isUnreportableRootPageFormDataProbe (XTIMATOR-2)', () => {
  it('drops the exact malformed FormData probe on the root page', () => {
    expect(
      isUnreportableRootPageFormDataProbe({
        transaction: 'POST /page',
        exception: {
          values: [
            { value: 'no boundary found in multipart body' },
            { value: 'Failed to parse body as FormData.' },
          ],
        },
      }),
    ).toBe(true)
  })

  it('keeps the same parsing failure reportable on a real API route', () => {
    expect(
      isUnreportableRootPageFormDataProbe({
        transaction: 'POST /api/estimates/[id]/refine',
        exception: {
          values: [{ value: 'Failed to parse body as FormData.' }],
        },
      }),
    ).toBe(false)
  })

  it('keeps unrelated root-page errors reportable', () => {
    expect(
      isUnreportableRootPageFormDataProbe({
        transaction: 'POST /page',
        exception: { values: [{ value: 'Database unavailable' }] },
      }),
    ).toBe(false)
  })
})
