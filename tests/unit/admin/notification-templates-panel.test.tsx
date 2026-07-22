import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { NotificationTemplatesPanel } from '@/components/admin/notification-templates-panel'
import { TENANT_TEMPLATE_CATALOG } from '@/lib/notifications/template-catalog'
import type { NotificationTemplateRow } from '@/lib/actions/admin-notification-templates'

// WARNING-2 (Opus plan-check hardening, extra task work on top of the plan's
// literal task list): the plan only specified a test file for the editor
// (Task 2). This file adds RTL coverage for the panel's own behavior —
// audience/category/channel navigation and remount-by-key — which the plan's
// human-verify checkpoint (Task 3) previously depended on manual click-through
// for. Per project standing preference, checkpoints are auto-approved; this
// automated coverage is what backs that approval instead.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

// The editor itself is exhaustively covered by
// notification-template-editor.test.tsx — mock it here so this file tests
// ONLY the panel's own responsibility: grouping, selection, and passing the
// right (eventType, channel, existing) props down, remounted via `key`.
vi.mock('@/components/admin/notification-template-editor', () => ({
  NotificationTemplateEditor: (props: {
    eventType: string
    channel: string
    existing: { id: string } | null
  }) => (
    <div
      data-testid="editor-mock"
      data-event={props.eventType}
      data-channel={props.channel}
      data-existing={props.existing ? props.existing.id : 'none'}
    >
      {/* Uncontrolled input seeded from props — only a true key-based remount
          (unmount + mount), not a props-only update, resets its DOM value. */}
      <input data-testid="draft-input" defaultValue={`draft-for-${props.eventType}-${props.channel}`} />
    </div>
  ),
}))

const CATEGORY_LABELS: Record<string, string> = {
  estimate: 'Estimates',
  billing: 'Billing',
  system: 'System',
  _dropped: 'Internal (not delivered to tenants)',
}

const EXISTING_ROW = {
  id: 'row-1',
  scope: 'tenant',
  event_type: 'estimate.viewed',
  channel: 'in_app',
  subject: null,
  title: 'Estimate viewed',
  body: 'seeded body',
  variables: ['clientName', 'estimateNumber'],
  is_active: true,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as NotificationTemplateRow

describe('NotificationTemplatesPanel', () => {
  it('lands all 17 tenant events into exactly the 4 category groups (Estimates/Billing/System/Internal)', () => {
    render(<NotificationTemplatesPanel initialTemplates={[]} />)

    expect(TENANT_TEMPLATE_CATALOG).toHaveLength(17)

    const byCategory = new Map<string, string[]>()
    for (const entry of TENANT_TEMPLATE_CATALOG) {
      const list = byCategory.get(entry.category) ?? []
      list.push(entry.label)
      byCategory.set(entry.category, list)
    }
    expect(byCategory.size).toBe(4)

    for (const [category, labels] of byCategory) {
      const group = screen.getByTestId(`category-group-${category}`)
      expect(within(group).getByText(CATEGORY_LABELS[category]!)).toBeTruthy()
      for (const label of labels) {
        expect(within(group).getByText(label)).toBeTruthy()
      }
      // No extra/missing events leak into or out of this group's nav list.
      expect(within(group).getAllByRole('button')).toHaveLength(labels.length)
    }
  })

  it('selecting a different (event, channel) mounts the editor with the correct key/props, discarding stale draft state', () => {
    render(<NotificationTemplatesPanel initialTemplates={[EXISTING_ROW]} />)

    // Default selection: first catalog event (estimate.viewed) on the in_app tab.
    expect(screen.getByTestId('editor-mock').getAttribute('data-event')).toBe('estimate.viewed')
    expect(screen.getByTestId('editor-mock').getAttribute('data-channel')).toBe('in_app')
    expect(screen.getByTestId('editor-mock').getAttribute('data-existing')).toBe('row-1')

    // Simulate an in-progress, unsaved edit inside the (mocked) editor.
    const draftInput = screen.getByTestId('draft-input') as HTMLInputElement
    fireEvent.change(draftInput, { target: { value: 'unsaved edit' } })
    expect(draftInput.value).toBe('unsaved edit')

    // Switch to a different event — a billing-category one with no saved row.
    fireEvent.click(screen.getByText('Payment received'))

    expect(screen.getByTestId('editor-mock').getAttribute('data-event')).toBe('payment.received')
    expect(screen.getByTestId('editor-mock').getAttribute('data-channel')).toBe('in_app')
    expect(screen.getByTestId('editor-mock').getAttribute('data-existing')).toBe('none')
    // A fresh mount resets to the prop-derived default, NOT the stale value
    // typed before switching — proves the parent remounts by key rather than
    // reusing the same instance across two different templates.
    expect((screen.getByTestId('draft-input') as HTMLInputElement).value).toBe(
      'draft-for-payment.received-in_app',
    )
  })

  it('the End Customer audience tab shows the static future-phase empty state with no fetch and no fake catalog', () => {
    render(<NotificationTemplatesPanel initialTemplates={[]} />)

    // Tenant events/editor are present before switching.
    expect(screen.getByTestId('editor-mock')).toBeTruthy()

    // Radix's TabsTrigger activates on `mousedown`, not `click` — see
    // @radix-ui/react-tabs's TabsTrigger implementation.
    fireEvent.mouseDown(screen.getByText('End Customer'), { button: 0 })

    expect(
      screen.getByText(
        'No end-customer events are defined yet — end-customer templates ship in a future phase.',
      ),
    ).toBeTruthy()
    // No event nav, no channel tabs, no editor mounted for the customer
    // audience — this tab does not wire a second data fetch or invent events.
    expect(screen.queryByTestId('editor-mock')).toBeNull()
    expect(screen.queryByTestId('category-group-estimate')).toBeNull()
  })
})
