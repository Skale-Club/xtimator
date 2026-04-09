import { describe, it, expect } from 'vitest'

describe('Supabase client module exports', () => {
  it('browser client module exports createClient function', async () => {
    const mod = await import('@/lib/supabase/client')
    expect(typeof mod.createClient).toBe('function')
  })

  it('server client module exports createClient function', async () => {
    const mod = await import('@/lib/supabase/server')
    expect(typeof mod.createClient).toBe('function')
  })

  it('proxy module exports updateSession function', async () => {
    const mod = await import('@/lib/supabase/proxy')
    expect(typeof mod.updateSession).toBe('function')
  })
})
