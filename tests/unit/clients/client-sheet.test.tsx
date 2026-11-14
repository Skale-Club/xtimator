import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientDetail } from '@/lib/queries/clients'

const { refresh, updateClient, createClient, toastError } = vi.hoisted(() => ({
  refresh: vi.fn(), updateClient: vi.fn(), createClient: vi.fn(), toastError: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }))
vi.mock('@/lib/actions/client', () => ({
  updateClientAction: updateClient,
  createClientAction: createClient,
  removeClientLogo: vi.fn(),
  uploadClientLogoAction: vi.fn(),
}))
vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <input aria-label="Phone" value={value} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/clients/client-logo-uploader', () => ({ ClientLogoUploader: () => null }))

import { ClientSheet } from '@/components/clients/client-sheet'

const client: ClientDetail = {
  id: 'client-one', name: 'Alice', email: 'alice@example.test', phone: null,
  logo_url: null, created_at: '2026-01-01', project_count: 2,
  address: '123 Main St', city: 'Boston', state: 'MA', zip: '02101',
  notes: 'Saved notes', preferred_language: 'pt',
}

beforeEach(() => {
  vi.clearAllMocks()
  updateClient.mockResolvedValue({ data: client })
  createClient.mockResolvedValue({ data: { id: 'new-client' } })
})
afterEach(cleanup)

describe('ClientSheet', () => {
  it('normalizes pasted email on blur and submits the cleaned address', async () => {
    render(<ClientSheet open client={client} companyId="company-one" onOpenChange={() => {}} />)
    const email = screen.getByPlaceholderText('Email address')
    fireEvent.change(email, { target: { value: '  Alice+Jobs@EXAMPLE.COM  ' } })
    fireEvent.blur(email)
    expect((email as HTMLInputElement).value).toBe('Alice+Jobs@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Update Client' }))
    await waitFor(() => expect(updateClient).toHaveBeenCalledWith(client.id, expect.objectContaining({ email: 'Alice+Jobs@example.com' })))
  })

  it('keeps an invalid email visible for correction and prevents saving', async () => {
    render(<ClientSheet open client={client} companyId="company-one" onOpenChange={() => {}} />)
    const email = screen.getByPlaceholderText('Email address')
    fireEvent.change(email, { target: { value: 'alice smith@example.com' } })
    fireEvent.blur(email)
    fireEvent.click(screen.getByRole('button', { name: 'Update Client' }))
    await waitFor(() => expect(screen.getByText('Invalid email')).toBeTruthy())
    expect((email as HTMLInputElement).value).toBe('alice smith@example.com')
    expect(updateClient).not.toHaveBeenCalled()
  })

  it('opens with saved values and discards cancelled changes without refreshing', () => {
    const onOpenChange = vi.fn()
    const props = { open: true, client, companyId: 'company-one', onOpenChange }
    const { rerender } = render(<ClientSheet {...props} />)
    expect((screen.getByPlaceholderText('Client name') as HTMLInputElement).value).toBe('Alice')
    expect((screen.getByPlaceholderText('Notes...') as HTMLTextAreaElement).value).toBe('Saved notes')

    fireEvent.change(screen.getByPlaceholderText('Client name'), { target: { value: 'Unsaved draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(refresh).not.toHaveBeenCalled()

    rerender(<ClientSheet {...props} open={false} />)
    rerender(<ClientSheet {...props} />)
    expect((screen.getByPlaceholderText('Client name') as HTMLInputElement).value).toBe('Alice')
  })

  it('refreshes once after a successful save and preserves all existing fields', async () => {
    const onOpenChange = vi.fn()
    render(<ClientSheet open client={client} companyId="company-one" onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update Client' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(updateClient).toHaveBeenCalledExactlyOnceWith(client.id, expect.objectContaining({
      address: client.address, notes: client.notes, preferred_language: 'pt',
    }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps the editor open without refreshing when saving fails', async () => {
    updateClient.mockResolvedValue({ error: 'Could not save' })
    const onOpenChange = vi.fn()
    render(<ClientSheet open client={client} companyId="company-one" onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update Client' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Could not save'))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('waits for linking a new client before issuing its single refresh', async () => {
    let finishLink!: () => void
    const linking = new Promise<void>((resolve) => { finishLink = resolve })
    const onCreated = vi.fn(() => linking)
    const onOpenChange = vi.fn()
    render(<ClientSheet open client={null} companyId="company-one" onOpenChange={onOpenChange} onCreated={onCreated} />)
    fireEvent.change(screen.getByPlaceholderText('Client name'), { target: { value: 'New Client' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-client'))
    expect(refresh).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    await act(async () => { finishLink() })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
