import { describe, expect, it, vi } from 'vitest'
import { isSameSignerRetry } from '@/lib/estimates/signer-retry'

function client(rows: unknown[] | null, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue({ data: rows, error })
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('isSameSignerRetry', () => {
  it('is true for the same name (case and spacing insensitive) and same email', async () => {
    const c = client([{ signer_name: 'Jane Doe', signer_email: 'Jane@Example.com' }])
    expect(await isSameSignerRetry(c, 'estimate_signatures', 'e1', ' jane doe ', 'jane@example.com')).toBe(true)
  })

  it('is true when the request carries no email', async () => {
    const c = client([{ signer_name: 'Jane Doe', signer_email: 'jane@example.com' }])
    expect(await isSameSignerRetry(c, 'estimate_signatures', 'e1', 'Jane Doe', null)).toBe(true)
  })

  it('is false for another name, another email, no signature, or a query error', async () => {
    expect(await isSameSignerRetry(client([{ signer_name: 'Jane Doe', signer_email: null }]), 'estimate_signatures', 'e1', 'Bob', null)).toBe(false)
    expect(
      await isSameSignerRetry(client([{ signer_name: 'Jane Doe', signer_email: 'a@x.com' }]), 'estimate_signatures', 'e1', 'Jane Doe', 'b@x.com'),
    ).toBe(false)
    expect(await isSameSignerRetry(client([]), 'change_order_signatures', 'c1', 'Jane Doe', null)).toBe(false)
    expect(await isSameSignerRetry(client(null, { message: 'x' }), 'change_order_signatures', 'c1', 'Jane Doe', null)).toBe(false)
  })

  it('queries the right foreign key per table', async () => {
    const c = client([])
    await isSameSignerRetry(c, 'change_order_signatures', 'c1', 'x', null)
    const chain = c.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }
    expect(chain.eq).toHaveBeenCalledWith('change_order_id', 'c1')
  })
})
