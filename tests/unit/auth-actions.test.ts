/**
 * Unit tests for lib/actions/auth.ts — RED phase (01-04 Task 1)
 *
 * These tests verify module shape (exports) since server actions
 * require a real Next.js runtime to invoke. Full flow covered in E2E.
 */
import { describe, it, expect } from 'vitest'

describe('lib/actions/auth module exports', () => {
  it('exports signUp as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signUp).toBe('function')
  })

  it('exports signIn as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signIn).toBe('function')
  })

  it('exports signOut as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.signOut).toBe('function')
  })

  it('exports resetPassword as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.resetPassword).toBe('function')
  })

  it('exports updatePassword as a function', async () => {
    const mod = await import('@/lib/actions/auth')
    expect(typeof mod.updatePassword).toBe('function')
  })
})

describe('components/auth/sign-out-button module exports', () => {
  it('exports SignOutButton as a function (React component)', async () => {
    const mod = await import('@/components/auth/sign-out-button')
    expect(typeof mod.SignOutButton).toBe('function')
  })
})
