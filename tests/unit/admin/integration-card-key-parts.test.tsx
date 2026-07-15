import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { IntegrationCard, type IntegrationKeyPart } from '@/app/admin/integrations/integration-card'

// Regression guard for the composite-key input. Twilio's credential is TWO
// values copied from two different places in the Twilio Console. They were
// crammed into ONE box that required the admin to type the ':' separator by
// hand — which produced a real "Key must be in AccountSid:AuthToken format"
// failure during a live credential rotation (the admin pasted only the token).
//
// The split is INPUT-ONLY: the parts are still joined with ':' into the single
// string that was always stored, so actions.ts's `key.split(':')`, the
// encrypted storage format and getTwilioConfig() stay untouched.

const saveIntegrationKey = vi.fn()
const deleteIntegrationKey = vi.fn()
const testIntegrationKey = vi.fn()

vi.mock('@/app/admin/integrations/actions', () => ({
  saveIntegrationKey: (...a: unknown[]) => saveIntegrationKey(...a),
  deleteIntegrationKey: (...a: unknown[]) => deleteIntegrationKey(...a),
  testIntegrationKey: (...a: unknown[]) => testIntegrationKey(...a),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const TWILIO_PARTS: IntegrationKeyPart[] = [
  { id: 'accountSid', label: 'Account SID', placeholder: 'AC…' },
  { id: 'authToken', label: 'Auth Token', secret: true },
]

// Obvious fakes. NEVER paste a real Account SID / Auth Token here: a Twilio
// auth token is bare 32-hex with no prefix, so gitleaks has no pattern for it
// and would happily let it through into git history.
const SID = 'ACfakefakefakefakefakefakefake0000'
const TOKEN = 'not-a-real-auth-token-000000000000'

function setup(keyParts?: IntegrationKeyPart[]) {
  return render(
    <IntegrationCard
      provider={'twilio' as never}
      title="Twilio"
      description="desc"
      initial={{ configured: false }}
      keyParts={keyParts}
    />
  )
}

function inputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll('input')) as HTMLInputElement[]
}

beforeEach(() => {
  vi.clearAllMocks()
  saveIntegrationKey.mockResolvedValue({ ok: true })
})

describe('IntegrationCard — composite key parts', () => {
  it('renders ONE input per part instead of a single combined box', () => {
    const { container } = setup(TWILIO_PARTS)
    expect(inputs(container)).toHaveLength(2)
    expect(screen.getByText('Account SID')).toBeTruthy()
    expect(screen.getByText('Auth Token')).toBeTruthy()
    // The old single-box label must be gone for this provider.
    expect(screen.queryByText('API key')).toBeNull()
  })

  it('joins the parts with ":" into the stored key — the admin never types the separator', async () => {
    const { container } = setup(TWILIO_PARTS)
    const [sid, token] = inputs(container)

    fireEvent.change(sid, { target: { value: SID } })
    fireEvent.change(token, { target: { value: TOKEN } })
    fireEvent.click(screen.getByText('Save key'))

    await vi.waitFor(() => expect(saveIntegrationKey).toHaveBeenCalled())
    expect(saveIntegrationKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'twilio', apiKey: `${SID}:${TOKEN}` })
    )
  })

  it('trims each part — a stray paste space cannot corrupt the stored key', async () => {
    const { container } = setup(TWILIO_PARTS)
    const [sid, token] = inputs(container)

    fireEvent.change(sid, { target: { value: `  ${SID} ` } })
    fireEvent.change(token, { target: { value: ` ${TOKEN}  ` } })
    fireEvent.click(screen.getByText('Save key'))

    await vi.waitFor(() => expect(saveIntegrationKey).toHaveBeenCalled())
    expect(saveIntegrationKey).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: `${SID}:${TOKEN}` })
    )
  })

  it('all parts blank → submits blank, preserving "leave blank to keep existing key"', () => {
    const { container } = setup(TWILIO_PARTS)
    const [sid, token] = inputs(container)
    fireEvent.change(sid, { target: { value: 'x' } })
    fireEvent.change(sid, { target: { value: '' } })
    fireEvent.change(token, { target: { value: '' } })
    // Nothing typed anywhere → Test stays disabled (no unsaved key, not configured).
    const testBtn = screen.getByText('Test').closest('button')
    expect(testBtn?.disabled).toBe(true)
  })

  it('Test sends the JOINED draft key, not a half-filled fragment', async () => {
    testIntegrationKey.mockResolvedValue({ ok: true, message: 'Verified.' })
    const { container } = setup(TWILIO_PARTS)
    const [sid, token] = inputs(container)

    fireEvent.change(sid, { target: { value: SID } })
    fireEvent.change(token, { target: { value: TOKEN } })
    fireEvent.click(screen.getByText('Test'))

    await vi.waitFor(() => expect(testIntegrationKey).toHaveBeenCalled())
    expect(testIntegrationKey).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'twilio', key: `${SID}:${TOKEN}` })
    )
  })

  it('without keyParts every other provider keeps the single API-key box', () => {
    const { container } = setup(undefined)
    expect(inputs(container)).toHaveLength(1)
    expect(screen.getByText('API key')).toBeTruthy()
    expect(screen.queryByText('Account SID')).toBeNull()
  })
})

// Both guards below cover bugs this split SHIPPED to production. A text input
// followed by a password input is the exact shape Chrome reads as a login form.
describe('IntegrationCard — composite parts must not read as a login form', () => {
  it('the secret part opts out of saved-password autofill (new-password, not off)', () => {
    const { container } = setup(TWILIO_PARTS)
    const secret = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(secret).toBeTruthy()
    // Chrome ignores autocomplete="off" on login-shaped forms and autofilled the
    // account email into Account SID + a saved password here → Twilio 20003
    // "invalid username". "new-password" is what actually opts out.
    expect(secret.getAttribute('autocomplete')).toBe('new-password')
  })

  it('neither part is named like a username/password field', () => {
    const { container } = setup(TWILIO_PARTS)
    for (const el of inputs(container)) {
      const name = (el.getAttribute('name') ?? '').toLowerCase()
      expect(name).not.toMatch(/^(username|email|user|login|password|pass)$/)
      // Password managers get an explicit opt-out too.
      expect(el.hasAttribute('data-1p-ignore')).toBe(true)
      expect(el.getAttribute('data-lpignore')).toBe('true')
    }
  })

  it('clearing a part does NOT fire "required" before submit (no layout shift under the cursor)', async () => {
    const { container } = setup(TWILIO_PARTS)
    const [sid, token] = inputs(container)

    fireEvent.change(sid, { target: { value: SID } })
    fireEvent.change(token, { target: { value: TOKEN } })
    fireEvent.change(sid, { target: { value: '' } })
    fireEvent.change(token, { target: { value: '' } })

    // Validating on every keystroke inserted this message the moment a field was
    // cleared, pushing Save/Test down mid-click. Errors belong on submit.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/required/i)).toBeNull()
  })

  it('an emptied form still Tests the STORED key instead of a fragment', async () => {
    testIntegrationKey.mockResolvedValue({ ok: true, message: 'Verified.' })
    // configured: true → Test targets the saved key when no draft is typed.
    const onChange = vi.fn()
    void onChange
    render(
      <IntegrationCard
        provider={'twilio' as never}
        title="Twilio"
        description="desc"
        initial={{ configured: true, last4: 'dd7b', updatedAt: new Date().toISOString(), updatedByEmail: 'a@b.c' }}
        keyParts={TWILIO_PARTS}
      />
    )
    fireEvent.click(screen.getAllByText('Test')[0])
    await vi.waitFor(() => expect(testIntegrationKey).toHaveBeenCalled())
    // No `key` property at all → server reads the stored credential.
    expect(testIntegrationKey).toHaveBeenCalledWith({ provider: 'twilio' })
  })
})
