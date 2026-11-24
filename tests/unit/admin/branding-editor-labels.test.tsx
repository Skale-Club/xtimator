import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrandingEditor } from '@/app/admin/branding/branding-editor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/admin/branding/actions', () => ({ saveBranding: vi.fn() }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (text: string) => text, language: 'en' }),
}))

afterEach(cleanup)

const initial = {
  appName: 'QA Branding',
  logoUrl: null,
  primaryColor: '#406EF1',
  emailFromName: 'QA Sender',
  faviconUrl: null,
}

describe('BrandingEditor labels', () => {
  it('associates the visible labels and descriptions with the editable fields', () => {
    render(<BrandingEditor initial={initial} />)

    const appName = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Application name',
      description: /Shown on auth pages/,
    })
    const color = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Primary color',
      description: /Accents buttons and focus rings/,
    })
    const sender = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Email sender name',
      description: /Appears as the sender on platform emails/,
    })
    const favicon = screen.getByLabelText<HTMLInputElement>('Favicon')

    expect(appName.value).toBe(initial.appName)
    expect(color.value).toBe(initial.primaryColor)
    expect(sender.value).toBe(initial.emailFromName)
    expect(favicon.type).toBe('file')
    expect(screen.getByRole('button', { name: 'Pick color', exact: true })).toBeTruthy()
  })

  it('gives the logo uploader a named group and keeps its upload button discoverable', () => {
    render(<BrandingEditor initial={initial} />)

    const logo = screen.getByRole('group', { name: 'Logo', description: /Square PNG or JPG/ })
    expect(within(logo).getByRole('button', { name: 'Upload company logo' })).toBeTruthy()
  })
})
