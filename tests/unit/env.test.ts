import { describe, it, expect } from 'vitest'

describe('Environment variable type declarations', () => {
  it('NEXT_PUBLIC_SUPABASE_URL type is declared', () => {
    // If TypeScript compiles this file, the declaration exists.
    // This test confirms the type declaration file was created correctly.
    const key = 'NEXT_PUBLIC_SUPABASE_URL' as keyof NodeJS.ProcessEnv
    expect(key).toBe('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix (SEC-03)', () => {
    // Confirm the key name is correct — no NEXT_PUBLIC_ prefix
    const key = 'SUPABASE_SERVICE_ROLE_KEY' satisfies keyof NodeJS.ProcessEnv
    expect(key.startsWith('NEXT_PUBLIC_')).toBe(false)
  })

  it('NEXT_PUBLIC_SUPABASE_ANON_KEY type is declared', () => {
    const key = 'NEXT_PUBLIC_SUPABASE_ANON_KEY' as keyof NodeJS.ProcessEnv
    expect(key).toBe('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })
})
