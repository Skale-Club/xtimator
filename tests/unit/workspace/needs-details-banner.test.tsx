import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * HARD-06 (web recourse UI) — Wave 0 RED scaffold (Phase 102).
 *
 * When a project survives the auto-refine cap still vague, the web adapter sets
 * `projects.status='awaiting_details'`. Today NOTHING in the UI surfaces it (a
 * dead-end). The recourse surface is a `NeedsDetailsBanner` rendered in
 * `overview-tab.tsx` when `project.status === 'awaiting_details'`, whose CTA
 * re-enters the existing capture/generate trigger.
 *
 * This test pins three things:
 *   1. The banner renders a title + a CTA when mounted.
 *   2. The `awaiting_details` GATE: an inline wrapper replicating
 *      `{status === 'awaiting_details' && <NeedsDetailsBanner .../>}` renders the
 *      banner only for that status and nothing otherwise.
 *   3. Clicking the CTA fires the `onAddDetails` callback exactly once (it reuses
 *      the existing generate trigger; the banner just dispatches the callback).
 *
 * RED today (intended): `@/components/workspace/needs-details-banner` does NOT
 * exist yet, so the import fails at module load — a clean "module not yet created"
 * RED. The assertions are ready to go GREEN once Plan 04 lands the component.
 *
 * Wave-1/2 owner: Phase 102 Plan 04 (HARD-06 recourse UI) creates
 * `components/workspace/needs-details-banner.tsx` (Alert + Button) and wires the
 * gate into `overview-tab.tsx`.
 *
 * i18n: mirror the established RTL stub — `useTranslation()` returns an identity
 * `t` (the English literal IS the key). Mock scoped; cleared per test.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}))

// Import the NOT-YET-EXISTING component. This import failing is the intended RED.
import { NeedsDetailsBanner } from '@/components/workspace/needs-details-banner'

/**
 * Tiny wrapper replicating the overview-tab gate so we can assert the banner is
 * hidden for any status other than 'awaiting_details'.
 */
function GatedBanner({
  status,
  onAddDetails,
}: {
  status: string
  onAddDetails: () => void
}) {
  return (
    <div>
      {status === 'awaiting_details' && (
        <NeedsDetailsBanner onAddDetails={onAddDetails} />
      )}
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HARD-06: NeedsDetailsBanner recourse UI', () => {
  it('renders a title and a CTA button when mounted', () => {
    render(<NeedsDetailsBanner onAddDetails={() => {}} />)
    // Title copy (English literal key). Loose: Plan 04 owns exact wording.
    expect(screen.getByText(/need a bit more detail/i)).toBeTruthy()
    // A real button CTA is present.
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('is hidden when project.status !== awaiting_details', () => {
    render(<GatedBanner status="draft" onAddDetails={() => {}} />)
    expect(screen.queryByText(/need a bit more detail/i)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is visible when project.status === awaiting_details', () => {
    render(<GatedBanner status="awaiting_details" onAddDetails={() => {}} />)
    expect(screen.getByText(/need a bit more detail/i)).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('clicking the CTA fires onAddDetails exactly once', () => {
    const onAddDetails = vi.fn()
    render(<NeedsDetailsBanner onAddDetails={onAddDetails} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onAddDetails).toHaveBeenCalledTimes(1)
  })
})
