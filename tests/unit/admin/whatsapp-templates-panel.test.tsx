import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WhatsAppTemplatesPanel } from '@/components/admin/whatsapp-templates-panel'
import type { TemplateRow } from '@/lib/actions/admin-whatsapp-templates'

// Phase 179 Plan 04 — Task 2. NEW file — no prior coverage of this panel
// existed. Mocks the composer (already exhaustively covered by
// whatsapp-template-composer.test.tsx) with a stub that exposes just enough
// surface to test the PANEL's own wiring responsibility: badges, action
// visibility per status, and the correct action calls.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const createTemplate = vi.fn()
const submitTemplateToMeta = vi.fn()
const checkTemplateStatus = vi.fn()
const updateTemplateAndResubmit = vi.fn()

vi.mock('@/lib/actions/admin-whatsapp-templates', () => ({
  createTemplate: (...a: unknown[]) => createTemplate(...a),
  submitTemplateToMeta: (...a: unknown[]) => submitTemplateToMeta(...a),
  checkTemplateStatus: (...a: unknown[]) => checkTemplateStatus(...a),
  updateTemplateAndResubmit: (...a: unknown[]) => updateTemplateAndResubmit(...a),
}))

vi.mock('@/components/admin/whatsapp-template-composer', () => ({
  WhatsAppTemplateComposer: (props: {
    initialBodyText?: string
    initialParams?: Array<{ label: string; example: string }>
    submitLabel: string
    onSubmit: (input: { bodyText: string; params: Array<{ label: string; example: string }> }) => void
  }) => (
    <div
      data-testid="composer-stub"
      data-submit-label={props.submitLabel}
      data-initial-body={props.initialBodyText ?? ''}
      data-initial-params={JSON.stringify(props.initialParams ?? [])}
    >
      <button
        type="button"
        onClick={() =>
          props.onSubmit({ bodyText: 'stub body', params: [{ label: 'x', example: 'y' }] })
        }
      >
        {props.submitLabel}
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  createTemplate.mockResolvedValue({ ok: true, row: {} })
  submitTemplateToMeta.mockResolvedValue({ ok: true, metaTemplateId: 'meta-x' })
  checkTemplateStatus.mockResolvedValue({ ok: true, status: 'pending', rejectionReason: null })
  updateTemplateAndResubmit.mockResolvedValue({ ok: true })
})

function makeRow(overrides: Partial<TemplateRow> & { id: string; status: string }): TemplateRow {
  return {
    event_category: 'billing',
    event_type: null,
    template_name: `tpl_${overrides.id}`,
    language_code: 'en_US',
    meta_template_id: null,
    rejection_reason: null,
    variables_schema: [],
    body_text: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const ALL_KNOWN_STATUSES = [
  'approved',
  'pending',
  'draft',
  'rejected',
  'paused',
  'disabled',
  'flagged',
  'in_appeal',
  'locked',
  'archived',
]

describe('WhatsAppTemplatesPanel', () => {
  it('renders a distinct visible status badge for every status Plan 179-03 can write', () => {
    const rows = ALL_KNOWN_STATUSES.map((status, i) => makeRow({ id: `row-${i}`, status }))
    render(<WhatsAppTemplatesPanel templates={rows} />)

    for (const status of ALL_KNOWN_STATUSES) {
      expect(screen.getByText(status)).toBeTruthy()
    }
  })

  it('shows "Submit to Meta" for a draft row and hides it for an approved row', () => {
    const rows = [makeRow({ id: 'r1', status: 'draft' }), makeRow({ id: 'r2', status: 'approved' })]
    render(<WhatsAppTemplatesPanel templates={rows} />)

    expect(screen.getAllByText('Submit to Meta')).toHaveLength(1)
  })

  it('shows "Check status now" for any row with a meta_template_id and hides it for a draft row with none', () => {
    const rows = [
      makeRow({ id: 'r1', status: 'draft', meta_template_id: null }),
      makeRow({ id: 'r2', status: 'pending', meta_template_id: 'meta-1' }),
    ]
    render(<WhatsAppTemplatesPanel templates={rows} />)

    expect(screen.getAllByText('Check status now')).toHaveLength(1)
  })

  it('clicking "Check status now" calls checkTemplateStatus with that row\'s id', async () => {
    const rows = [makeRow({ id: 'r1', status: 'pending', meta_template_id: 'meta-1' })]
    render(<WhatsAppTemplatesPanel templates={rows} />)

    fireEvent.click(screen.getByText('Check status now'))

    await vi.waitFor(() => expect(checkTemplateStatus).toHaveBeenCalledWith('r1'))
  })

  it('shows rejection_reason + Edit & Resubmit for a rejected row, Edit & Resubmit for an approved row, and neither for draft/pending', () => {
    const rows = [
      makeRow({ id: 'r1', status: 'rejected', rejection_reason: 'Body too promotional' }),
      makeRow({ id: 'r2', status: 'approved' }),
      makeRow({ id: 'r3', status: 'draft' }),
      makeRow({ id: 'r4', status: 'pending' }),
    ]
    render(<WhatsAppTemplatesPanel templates={rows} />)

    expect(screen.getByText('Body too promotional')).toBeTruthy()
    expect(screen.getAllByText('Edit & Resubmit')).toHaveLength(2)
  })

  it('clicking Edit & Resubmit reveals the composer pre-filled from body_text/variables_schema; submitting calls updateTemplateAndResubmit(row.id, ...)', async () => {
    const row = makeRow({
      id: 'row-rejected',
      status: 'rejected',
      rejection_reason: 'Body too promotional',
      body_text: 'Hi {{1}}, your invoice is ready.',
      variables_schema: [{ label: 'Client name', example: 'John' }],
    })
    render(<WhatsAppTemplatesPanel templates={[row]} />)

    fireEvent.click(screen.getByText('Edit & Resubmit'))

    const stubs = screen.getAllByTestId('composer-stub')
    const editStub = stubs.find((el) => el.getAttribute('data-submit-label') === 'Update & Resubmit')
    expect(editStub).toBeTruthy()
    expect(editStub!.getAttribute('data-initial-body')).toBe(row.body_text)
    expect(JSON.parse(editStub!.getAttribute('data-initial-params') || '[]')).toEqual(
      row.variables_schema,
    )

    fireEvent.click(screen.getByText('Update & Resubmit'))

    await vi.waitFor(() =>
      expect(updateTemplateAndResubmit).toHaveBeenCalledWith('row-rejected', {
        body_text: 'stub body',
        variables_schema: [{ label: 'x', example: 'y' }],
      }),
    )
  })

  it('the create-flow composer submit calls createTemplate with the surrounding form fields plus the composer body/params', async () => {
    render(<WhatsAppTemplatesPanel templates={[]} />)

    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'owner_billing_alert' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create template' }))

    await vi.waitFor(() =>
      expect(createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          template_name: 'owner_billing_alert',
          language_code: 'en_US',
          event_category: 'billing',
          body_text: 'stub body',
          variables_schema: [{ label: 'x', example: 'y' }],
        }),
      ),
    )
  })
})
