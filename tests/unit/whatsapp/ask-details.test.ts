import { describe, it, expect, vi } from 'vitest'
import {
  isVagueEstimate,
  buildAskDetailsMessage,
  revertVagueEstimate,
} from '@/lib/whatsapp/ask-details'

/**
 * Quick task 260529-lc0: helpers for the WhatsApp "ask for more details" branch.
 *
 *   - isVagueEstimate: an estimate is vague when total <= 0 OR there are no
 *     line items in any section.
 *   - buildAskDetailsMessage: localized (pt/en/es) prompt mentioning the 4
 *     examples (service type, area, materials, deadline).
 *   - revertVagueEstimate: submits the vague draft to the atomic discard RPC.
 */

describe('isVagueEstimate', () => {
  it('true when total is 0 (with items)', () => {
    expect(isVagueEstimate({ total: 0, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when total is null', () => {
    expect(isVagueEstimate({ total: null, sections: [{ items: [{}] }] })).toBe(true)
  })

  it('true when sections have empty items', () => {
    expect(isVagueEstimate({ total: 100, sections: [{ items: [] }] })).toBe(true)
  })

  it('true when sections is null', () => {
    expect(isVagueEstimate({ total: 100, sections: null })).toBe(true)
  })

  it('true when estimate is null', () => {
    expect(isVagueEstimate(null)).toBe(true)
  })

  it('false when total > 0 and at least one item exists', () => {
    expect(isVagueEstimate({ total: 100, sections: [{ items: [{}] }] })).toBe(false)
  })
})

describe('buildAskDetailsMessage', () => {
  it('pt: Portuguese copy mentioning the 4 examples', () => {
    const msg = buildAskDetailsMessage('pt')
    expect(msg).toMatch(/detalhes/i)
    expect(msg).toMatch(/serviço/i)
    expect(msg).toMatch(/área/i)
    expect(msg).toMatch(/materiais/i)
    expect(msg).toMatch(/prazo/i)
  })

  it('es: Spanish copy mentioning the 4 examples', () => {
    const msg = buildAskDetailsMessage('es')
    expect(msg).toMatch(/detalles/i)
    expect(msg).toMatch(/servicio/i)
    expect(msg).toMatch(/área|area/i)
    expect(msg).toMatch(/materiales/i)
    expect(msg).toMatch(/plazo/i)
  })

  it('en: English copy mentioning the 4 examples', () => {
    const msg = buildAskDetailsMessage('en')
    expect(msg).toMatch(/details/i)
    expect(msg).toMatch(/service/i)
    expect(msg).toMatch(/area/i)
    expect(msg).toMatch(/materials/i)
    expect(msg).toMatch(/deadline|timeline/i)
  })

  it('unknown language falls back to English', () => {
    const msg = buildAskDetailsMessage('de' as never)
    expect(msg).toBe(buildAskDetailsMessage('en'))
  })
})

describe('revertVagueEstimate', () => {
  it('discards the estimate transactionally with draft as the fallback status', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await revertVagueEstimate({ rpc } as never, 'proj-1', 'est-1', 'company-1')

    expect(rpc).toHaveBeenCalledExactlyOnceWith('discard_vague_estimate', {
      p_company_id: 'company-1',
      p_project_id: 'proj-1',
      p_estimate_id: 'est-1',
      p_status: 'draft',
    })
  })

  it('passes the final-vague awaiting_details status to the same transaction', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await revertVagueEstimate({ rpc } as never, 'proj-1', 'est-1', 'company-1', 'awaiting_details')

    expect(rpc).toHaveBeenCalledExactlyOnceWith('discard_vague_estimate', {
      p_company_id: 'company-1',
      p_project_id: 'proj-1',
      p_estimate_id: 'est-1',
      p_status: 'awaiting_details',
    })
  })

  it('surfaces a returned RPC error to the caller', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'discard rejected' } })

    await expect(revertVagueEstimate({ rpc } as never, 'proj-1', 'est-1', 'company-1'))
      .rejects.toThrow('Failed to discard vague estimate')
  })

  it('leaves the project alone when there is no estimate ID', async () => {
    const rpc = vi.fn()

    await revertVagueEstimate({ rpc } as never, 'proj-1', null, 'company-1')

    expect(rpc).not.toHaveBeenCalled()
  })
})
