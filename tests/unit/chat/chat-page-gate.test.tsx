import { describe, expect, it, vi } from 'vitest'

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import ChatPage from '@/app/(app)/chat/[[...id]]/page'

describe('dormant in-app chat page', () => {
  it('redirects direct access to dashboard', () => {
    expect(() => ChatPage()).toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
  })
})
