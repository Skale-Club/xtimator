import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { SignaturePad } from '@/components/share/signature-pad'

// S4 (security-hardening) — signer email is an optional field the ESIGN
// consent flow can attach to the recorded signature; it must never become a
// required field (see estimate-view.tsx's submit-disabled logic, which keys
// only off signerName + signatureData).

function Harness({
  onEmailChange,
}: {
  onEmailChange?: (email: string) => void
}) {
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  return (
    <SignaturePad
      signerName={signerName}
      onSignerNameChange={setSignerName}
      signerEmail={signerEmail}
      onSignerEmailChange={(email) => {
        setSignerEmail(email)
        onEmailChange?.(email)
      }}
      onSignatureChange={() => {}}
    />
  )
}

describe('SignaturePad — signer email field', () => {
  it('renders an optional email input labeled "Email (optional)"', () => {
    render(<Harness />)
    const input = screen.getByLabelText('Email (optional)') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.type).toBe('email')
    expect(input.required).toBe(false)
  })

  it('updates value and calls onSignerEmailChange as the user types', () => {
    const onEmailChange = vi.fn()
    render(<Harness onEmailChange={onEmailChange} />)
    const input = screen.getByLabelText('Email (optional)') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'client@example.com' } })

    expect(onEmailChange).toHaveBeenLastCalledWith('client@example.com')
    expect(input.value).toBe('client@example.com')
  })

  it('still renders the existing required-in-practice name field untouched', () => {
    render(<Harness />)
    const nameInput = screen.getByLabelText('Your full name') as HTMLInputElement
    expect(nameInput).toBeTruthy()
    expect(nameInput.type).toBe('text')
  })
})
