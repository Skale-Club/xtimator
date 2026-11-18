import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(), requireServiceClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => 'company-1' }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => null, assertCompanyWritable: async () => null }))
vi.mock('@/lib/billing/access-guard', () => ({ billingCreateDenied: vi.fn(), billingEditDenied: vi.fn() }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createBlankEstimate } from '@/lib/actions/estimate'
import { billingCreateDenied } from '@/lib/billing/access-guard'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'

function readRow(data: Record<string, unknown> | null) {
  const eq = vi.fn().mockReturnThis()
  const read = async () => ({ data, error: null })
  const select = vi.fn().mockReturnValue({ eq, single: read, maybeSingle: read })
  return { select, eq }
}

function arrange({ projectVisible = true, currentId }: { projectVisible?: boolean; currentId?: string } = {}) {
  const activity = vi.fn().mockResolvedValue({ error: null })
  const projects = readRow(projectVisible ? { id: 'project-1' } : null)
  const estimates = readRow(currentId ? { id: currentId } : null)
  const company = readRow({ id: 'company-1', currency_code: 'USD', default_tax_rate: 0.1 })
  const userFrom = (table: string) => {
    if (table === 'companies') return company
    if (table === 'projects') return projects
    if (table === 'estimates') return estimates
    if (table === 'estimate_activity') return { insert: activity }
    throw new Error(`Unexpected user table ${table}`)
  }
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1' } } }) },
    from: userFrom,
  } as never)
  vi.mocked(billingCreateDenied).mockResolvedValue(null)

  const stage = vi.fn(() => readRow({ id: 'estimate-staged' }))
  const cleanupFilter = vi.fn().mockReturnThis()
  const cleanup = vi.fn(() => ({
    eq: cleanupFilter,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  }))
  const sections = vi.fn(() => ({ select: async () => ({ data: [{ id: 'section-1' }], error: null }) }))
  const items = vi.fn().mockResolvedValue({ error: null })
  const serviceFrom = (table: string) => {
    if (table === 'estimates') return { insert: stage, delete: cleanup }
    if (table === 'estimate_sections') return { insert: sections }
    if (table === 'estimate_items') return { insert: items }
    throw new Error(`Unexpected service table ${table}`)
  }
  const rpc = vi.fn().mockResolvedValue({ data: { estimate_id: 'estimate-staged', version: 3 }, error: null })
  vi.mocked(requireServiceClient).mockReturnValue({ from: serviceFrom, rpc } as never)

  return { projects, estimates, activity, stage, sections, items, cleanupFilter, rpc }
}

describe('createBlankEstimate', () => {
  afterEach(() => vi.clearAllMocks())

  it('checks the project belongs to the active company before service-role writes', async () => {
    const db = arrange({ projectVisible: false })

    expect(await createBlankEstimate('project-1')).toEqual({ error: 'Project not found' })

    expect(db.projects.eq).toHaveBeenCalledWith('id', 'project-1')
    expect(db.projects.eq).toHaveBeenCalledWith('company_id', 'company-1')
    expect(requireServiceClient).not.toHaveBeenCalled()
  })

  it('returns an existing current estimate before checking creation credits', async () => {
    const db = arrange({ currentId: 'existing' })

    expect(await createBlankEstimate('project-1')).toEqual({ data: { estimateId: 'existing' } })

    expect(db.estimates.eq).toHaveBeenCalledWith('company_id', 'company-1')
    expect(billingCreateDenied).not.toHaveBeenCalled()
    expect(requireServiceClient).not.toHaveBeenCalled()
  })

  it('saves the starter content and records the version assigned by activation', async () => {
    const db = arrange()

    expect(await createBlankEstimate('project-1')).toEqual({ data: { estimateId: 'estimate-staged' } })

    expect(db.stage).toHaveBeenCalledWith(expect.objectContaining({ is_current: false, generation_staged: true }))
    expect(db.sections).toHaveBeenCalledWith([expect.objectContaining({ title: 'General' })])
    expect(db.items).toHaveBeenCalledWith([expect.objectContaining({ section_id: 'section-1', quantity: 1, unit_price: 0 })])
    expect(db.rpc).toHaveBeenCalledWith('activate_estimate_version', expect.objectContaining({
      p_company_id: 'company-1',
      p_project_id: 'project-1',
      p_keep_existing: true,
    }))
    expect(db.activity).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'estimate_created_blank', metadata: { version: 3 },
    }))
  })

  it('returns the winner of a concurrent write without recording another creation', async () => {
    const db = arrange()
    db.rpc.mockResolvedValueOnce({ data: { estimate_id: 'estimate-winner', version: 6 }, error: null })

    expect(await createBlankEstimate('project-1')).toEqual({ data: { estimateId: 'estimate-winner' } })

    expect(db.cleanupFilter).toHaveBeenCalledWith('id', 'estimate-staged')
    expect(db.activity).not.toHaveBeenCalled()
    expect(dispatchXphereSync).not.toHaveBeenCalled()
  })
})
