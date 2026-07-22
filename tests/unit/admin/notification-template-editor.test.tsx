import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationTemplateEditor } from '@/components/admin/notification-template-editor'

// The component under test does not exist yet at RED time — mirrors
// tests/unit/admin/integration-card-key-parts.test.tsx's pattern: mock the
// server-action module + sonner + i18n around a form component.

const saveNotificationTemplate = vi.fn()
const sendTestNotification = vi.fn()

vi.mock('@/lib/actions/admin-notification-templates', () => ({
  saveNotificationTemplate: (...a: unknown[]) => saveNotificationTemplate(...a),
  sendTestNotification: (...a: unknown[]) => sendTestNotification(...a),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  saveNotificationTemplate.mockResolvedValue({ ok: true, row: {} })
  sendTestNotification.mockResolvedValue({ ok: true })
})

function getBodyTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Body') as HTMLTextAreaElement
}

describe('NotificationTemplateEditor', () => {
  it('renders one chip per catalog variable for estimate.viewed / in_app', () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    expect(screen.getByText('{{clientName}}')).toBeTruthy()
    expect(screen.getByText('{{estimateNumber}}')).toBeTruthy()
  })

  it('renders ZERO variable chips + a "no editable variables" note for admin.bonus_credits_granted (CREDITUI-04)', () => {
    render(
      <NotificationTemplateEditor
        eventType="admin.bonus_credits_granted"
        channel="in_app"
        existing={null}
      />,
    )

    expect(screen.queryByText(/\{\{\w+\}\}/)).toBeNull()
    expect(
      screen.getByText('This event has no editable variables — its copy must stay static.'),
    ).toBeTruthy()
  })

  it('typing an unknown variable shows a named inline error and disables Save', () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.change(getBodyTextarea(), { target: { value: '{{unknownVar}}' } })

    expect(screen.getByTestId('tpl-body-error').textContent).toMatch(/unknownVar/)
    const saveButton = screen.getByText('Save').closest('button')
    expect(saveButton?.disabled).toBe(true)
  })

  it('the live preview renders real renderTemplate() output against the pinned sample fixture', () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    expect(screen.getByText('Jane Doe opened estimate EST-1042.')).toBeTruthy()
  })

  it('clicking a variable chip appends {{variable}} to the body field', () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    const before = getBodyTextarea().value
    fireEvent.click(screen.getByText('{{clientName}}'))

    expect(getBodyTextarea().value).toBe(`${before}{{clientName}}`)
  })

  it('Save calls saveNotificationTemplate once with eventType, channel, and the current body', async () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.change(getBodyTextarea(), { target: { value: 'Updated body for {{clientName}}.' } })
    fireEvent.click(screen.getByText('Save'))

    await vi.waitFor(() => expect(saveNotificationTemplate).toHaveBeenCalledTimes(1))
    expect(saveNotificationTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'estimate.viewed',
        channel: 'in_app',
        body: 'Updated body for {{clientName}}.',
      }),
    )
  })

  it('the Email test-send button calls sendTestNotification with the in-progress (unsaved) body', async () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.change(getBodyTextarea(), { target: { value: 'Draft body {{clientName}}.' } })
    fireEvent.click(screen.getByText('Email'))

    await vi.waitFor(() => expect(sendTestNotification).toHaveBeenCalledTimes(1))
    expect(sendTestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'email', body: 'Draft body {{clientName}}.' }),
    )
  })

  // WARNING-2 (Opus plan-check hardening, extra task work): the plan's
  // <behavior> list only spells out the Email assertion above — extend the
  // same "test-send uses live form state" coverage to SMS and Telegram so
  // all 3 targets are proven, not just the one target the plan wrote out.
  it('the SMS test-send button short-circuits (no dispatch) when no phone number is entered', () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.click(screen.getByText('SMS'))

    expect(sendTestNotification).not.toHaveBeenCalled()
  })

  it('the SMS test-send button calls sendTestNotification with the in-progress body once a phone is entered', async () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.change(getBodyTextarea(), { target: { value: 'Draft SMS body {{clientName}}.' } })
    fireEvent.change(screen.getByLabelText('Test SMS phone (E.164)'), {
      target: { value: '+15551234567' },
    })
    fireEvent.click(screen.getByText('SMS'))

    await vi.waitFor(() => expect(sendTestNotification).toHaveBeenCalledTimes(1))
    expect(sendTestNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sms',
        body: 'Draft SMS body {{clientName}}.',
        toPhone: '+15551234567',
      }),
    )
  })

  it('the Telegram test-send button calls sendTestNotification with the in-progress body', async () => {
    render(<NotificationTemplateEditor eventType="estimate.viewed" channel="in_app" existing={null} />)

    fireEvent.change(getBodyTextarea(), { target: { value: 'Draft telegram body {{clientName}}.' } })
    fireEvent.click(screen.getByText('Telegram'))

    await vi.waitFor(() => expect(sendTestNotification).toHaveBeenCalledTimes(1))
    expect(sendTestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'telegram', body: 'Draft telegram body {{clientName}}.' }),
    )
  })
})
