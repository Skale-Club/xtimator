import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * 260927: the project's estimate tab while a generation runs.
 *
 * It used to show three bouncing dots and one static label, and a project
 * with no estimate yet would materialize a blank one while the AI estimate was
 * still being written. These tests pin that the tab shows the same checklist as
 * the capture popup, holds off the blank, shows a banner when a new VERSION is
 * generating over an existing estimate, and falls back cleanly on failure.
 */

const replace = vi.fn()
const refresh = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/projects/p1',
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const createBlankEstimate = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  createBlankEstimate: (...a: unknown[]) => createBlankEstimate(...a),
}))

vi.mock('@/components/workspace/estimate/estimate-editor', () => ({
  EstimateEditor: () => <div data-testid="estimate-editor" />,
}))
vi.mock('@/components/workspace/send/send-hub-dialog', () => ({
  SendHubDialog: () => null,
}))
vi.mock('@/components/workspace/estimate/client-suggestion-toast', () => ({
  popStoredClientSuggestion: () => null,
  showClientSuggestionToast: vi.fn(),
}))
vi.mock('@/hooks/use-wake-lock', () => ({ useWakeLock: vi.fn() }))
vi.mock('@/components/ui/tower-loader', () => ({
  TowerLoader: () => <div data-testid="tower-loader" />,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
  useAppTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))

let backgroundGeneration: { attemptId: string; projectId: string; mode?: string; since: string } | null = null
vi.mock('@/hooks/use-background-generations', () => ({
  useBackgroundGeneration: () => backgroundGeneration,
}))
const removeBackgroundGeneration = vi.fn()
vi.mock('@/lib/estimate/background-generations', () => ({
  removeBackgroundGeneration: (id: string) => removeBackgroundGeneration(id),
}))

let attemptState: { attemptId: string | null; progress: unknown; outcome: unknown; gaveUp: boolean } = {
  attemptId: null,
  progress: null,
  outcome: null,
  gaveUp: false,
}
const useAttemptProgress = vi.fn()
vi.mock('@/hooks/use-attempt-progress', () => ({
  useAttemptProgress: (id: string | null) => {
    useAttemptProgress(id)
    return { state: attemptState, medians: undefined }
  },
}))

import { EstimateTab } from '@/components/workspace/estimate/estimate-tab'

const PROGRESS = {
  completedSteps: ['save_recording', 'transcribe'],
  activeStep: 'generate_estimate',
  activeStepStartedAt: new Date().toISOString(),
  phaseVisits: [{ phase: 'drafting', startedAt: new Date().toISOString(), detail: {} }],
}

function renderTab(currentEstimate: unknown = null) {
  const props = {
    projectId: 'p1',
    companyId: 'c1',
    companyBrandColor: null,
    company: {},
    companyDefaults: {},
    currentEstimate,
    allVersions: [],
    issuedInvoices: [],
    paymentsEnabled: false,
    recordings: [],
    photos: [],
    projectName: 'Smith Kitchen',
    projectType: null,
    client: null,
    priceBookItems: [],
    companyName: 'Acme',
    ownerName: 'Owner',
    estimateTemplate: {},
    estimateTemplateId: 'classic',
    preparedBy: null,
  }
  return render(<EstimateTab {...(props as unknown as Parameters<typeof EstimateTab>[0])} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  search = ''
  backgroundGeneration = null
  attemptState = { attemptId: null, progress: null, outcome: null, gaveUp: false }
  createBlankEstimate.mockResolvedValue({ data: { estimateId: 'blank' } })
})

describe('EstimateTab while an estimate generates (260927)', () => {
  it('shows the live checklist for the attempt in the URL, and does not create a blank', () => {
    search = 'autoGenerating=true&attempt=a1'
    attemptState = { attemptId: 'a1', progress: PROGRESS, outcome: null, gaveUp: false }
    renderTab()
    expect(useAttemptProgress).toHaveBeenCalledWith('a1')
    expect(screen.getByTestId('capture-progress-checklist')).toBeTruthy()
    expect(screen.getByTestId('checklist-row-generate:drafting').getAttribute('data-state')).toBe('active')
    expect(createBlankEstimate).not.toHaveBeenCalled()
  })

  it('narrates a generation the operator left running in the popup', () => {
    backgroundGeneration = { attemptId: 'bg1', projectId: 'p1', mode: 'text', since: new Date().toISOString() }
    attemptState = { attemptId: 'bg1', progress: PROGRESS, outcome: null, gaveUp: false }
    renderTab()
    expect(useAttemptProgress).toHaveBeenCalledWith('bg1')
    // Text mode: no transcription row.
    expect(screen.queryByTestId('checklist-row-transcribe')).toBeNull()
    expect(createBlankEstimate).not.toHaveBeenCalled()
  })

  it('shows a banner, not the full checklist, when a new version generates over an estimate', () => {
    backgroundGeneration = { attemptId: 'bg1', projectId: 'p1', mode: 'audio', since: new Date().toISOString() }
    attemptState = { attemptId: 'bg1', progress: PROGRESS, outcome: null, gaveUp: false }
    renderTab({ id: 'e1' })
    expect(screen.getByTestId('generation-progress-banner')).toBeTruthy()
    expect(screen.getByTestId('estimate-editor')).toBeTruthy()
    expect(screen.queryByTestId('capture-progress-checklist')).toBeNull()
  })

  it('refreshes when the journal says the estimate is ready', () => {
    search = 'autoGenerating=true&attempt=a1'
    attemptState = { attemptId: 'a1', progress: PROGRESS, outcome: { state: 'completed', estimateId: 'e9' }, gaveUp: false }
    renderTab()
    expect(refresh).toHaveBeenCalled()
    expect(createBlankEstimate).not.toHaveBeenCalled()
  })

  it('drops the waiting params on failure so the tab falls back to an editable estimate', () => {
    search = 'autoGenerating=true&attempt=a1&tab=estimate'
    attemptState = { attemptId: 'a1', progress: PROGRESS, outcome: { state: 'failed', step: 'generate_estimate', reason: 'x' }, gaveUp: false }
    renderTab()
    expect(replace).toHaveBeenCalledWith('/projects/p1?tab=estimate', { scroll: false })
  })

  it('still creates the blank estimate when nothing is generating', () => {
    renderTab()
    expect(createBlankEstimate).toHaveBeenCalledWith('p1')
  })

  it('drops an attempt it cannot narrate and falls back to the blank estimate', () => {
    search = 'autoGenerating=true&attempt=foreign'
    attemptState = { attemptId: 'foreign', progress: null, outcome: null, gaveUp: true }
    renderTab()
    expect(removeBackgroundGeneration).toHaveBeenCalledWith('foreign')
    expect(replace).toHaveBeenCalledWith('/projects/p1', { scroll: false })
    expect(screen.queryByTestId('capture-progress-checklist')).toBeNull()
    expect(createBlankEstimate).toHaveBeenCalledWith('p1')
  })
})
