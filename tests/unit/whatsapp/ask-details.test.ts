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
 *   - revertVagueEstimate: deletes the $0 estimate (cascade) and reverts the
 *     project to draft / total 0.
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
  function makeSupabase() {
    const estimatesEq = vi.fn().mockResolvedValue({ error: null })
    const estimatesDelete = vi.fn().mockReturnValue({ eq: estimatesEq })
    const projectsEq = vi.fn().mockResolvedValue({ error: null })
    const projectsUpdate = vi.fn().mockReturnValue({ eq: projectsEq })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'estimates') return { delete: estimatesDelete }
      if (table === 'projects') return { update: projectsUpdate }
      return {}
    })
    return {
      client: { from } as never,
      from,
      estimatesDelete,
      estimatesEq,
      projectsUpdate,
      projectsEq,
    }
  }

  it('deletes the estimate and reverts the project to draft / total 0', async () => {
    const s = makeSupabase()
    await revertVagueEstimate(s.client, 'proj-1', 'est-1')

    expect(s.from).toHaveBeenCalledWith('estimates')
    expect(s.estimatesEq).toHaveBeenCalledWith('id', 'est-1')
    expect(s.from).toHaveBeenCalledWith('projects')
    expect(s.projectsUpdate).toHaveBeenCalledWith({ status: 'draft', total: 0 })
    expect(s.projectsEq).toHaveBeenCalledWith('id', 'proj-1')
  })

  it('skips estimate delete when estimateId is null but still reverts project', async () => {
    const s = makeSupabase()
    await revertVagueEstimate(s.client, 'proj-1', null)

    expect(s.estimatesDelete).not.toHaveBeenCalled()
    expect(s.projectsUpdate).toHaveBeenCalledWith({ status: 'draft', total: 0 })
    expect(s.projectsEq).toHaveBeenCalledWith('id', 'proj-1')
  })
})
