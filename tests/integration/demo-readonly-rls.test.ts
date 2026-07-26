/**
 * Live direct-Supabase proof for SAFE-03.
 *
 * This suite is deliberately opt-in because it creates test-owned Auth, table,
 * membership, and Storage fixtures. Point it only at a disposable/local
 * Supabase project and set RUN_DEMO_RLS_INTEGRATION=1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD
const RUN_LIVE = process.env.RUN_DEMO_RLS_INTEGRATION === '1'

const hasLiveEnv = Boolean(
  RUN_LIVE &&
    SUPABASE_URL &&
    SERVICE_ROLE &&
    ANON_KEY &&
    DEMO_EMAIL &&
    DEMO_PASSWORD,
)
const liveDescribe = hasLiveEnv ? describe : describe.skip

const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const prefix = `phase180-13-${run}`
const password = `Xtimator-${run}-Aa1!`
const onePixelPng = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C62000000000500010D0A2DB40000000049454E44AE426082',
  'hex',
)

function nonPersistentClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function expectRlsDenial(error: { message: string } | null) {
  expect(error).not.toBeNull()
  expect(error!.message).toMatch(
    /row-level security|new row|not authorized|permission|policy|unauthorized/i,
  )
}

liveDescribe(
  'demo read-only RLS live contract (requires local/disposable env + RUN_DEMO_RLS_INTEGRATION=1)',
  () => {
    const service = nonPersistentClient(SERVICE_ROLE!)
    const normal = nonPersistentClient(ANON_KEY!)
    const demo = nonPersistentClient(ANON_KEY!)

    let normalUserId = ''
    let normalCompanyId = ''
    let demoUserId = ''
    let demoCompanyId = ''
    let demoProjectId = ''
    let normalProjectId = ''
    let demoObjectPath = ''
    let normalObjectPath = ''

    beforeAll(async () => {
      const mapping = await service
        .from('demo_config')
        .select('user_id, company_id')
        .single()
      expect(mapping.error).toBeNull()
      demoUserId = mapping.data!.user_id as string
      demoCompanyId = mapping.data!.company_id as string

      const demoSignIn = await demo.auth.signInWithPassword({
        email: DEMO_EMAIL!,
        password: DEMO_PASSWORD!,
      })
      expect(demoSignIn.error).toBeNull()
      expect(demoSignIn.data.user?.id).toBe(demoUserId)

      const createdUser = await service.auth.admin.createUser({
        email: `${prefix}@test.xtimator.local`,
        password,
        email_confirm: true,
      })
      expect(createdUser.error).toBeNull()
      normalUserId = createdUser.data.user!.id

      const company = await service
        .from('companies')
        .insert({
          user_id: normalUserId,
          name: `${prefix}-normal-company`,
        })
        .select('id')
        .single()
      expect(company.error).toBeNull()
      normalCompanyId = company.data!.id as string

      const memberships = await service.from('company_members').insert([
        { user_id: normalUserId, company_id: normalCompanyId, role: 'owner' },
        { user_id: normalUserId, company_id: demoCompanyId, role: 'member' },
      ])
      expect(memberships.error).toBeNull()

      const normalSignIn = await normal.auth.signInWithPassword({
        email: `${prefix}@test.xtimator.local`,
        password,
      })
      expect(normalSignIn.error).toBeNull()

      const demoProject = await service
        .from('projects')
        .insert({
          company_id: demoCompanyId,
          name: `${prefix}-demo-project`,
          status: 'draft',
        })
        .select('id')
        .single()
      expect(demoProject.error).toBeNull()
      demoProjectId = demoProject.data!.id as string

      demoObjectPath = `${demoCompanyId}/${prefix}-demo.png`
      normalObjectPath = `${normalCompanyId}/${prefix}-normal.png`
      const demoUpload = await service.storage
        .from('photos')
        .upload(demoObjectPath, onePixelPng, { contentType: 'image/png', upsert: true })
      expect(demoUpload.error).toBeNull()
    }, 45_000)

    afterAll(async () => {
      if (demoObjectPath) {
        await service.storage.from('photos').remove([demoObjectPath])
      }
      if (normalObjectPath) {
        await service.storage.from('photos').remove([normalObjectPath])
      }
      if (demoProjectId) {
        await service.from('projects').delete().eq('id', demoProjectId)
      }
      if (normalCompanyId) {
        await service.from('projects').delete().eq('company_id', normalCompanyId)
        await service
          .from('company_members')
          .delete()
          .eq('user_id', normalUserId)
          .eq('company_id', demoCompanyId)
        await service.from('companies').delete().eq('id', normalCompanyId)
      }
      if (normalUserId) {
        await service.auth.admin.deleteUser(normalUserId)
      }
    }, 45_000)

    it('allows the demo principal to read seeded demo-company rows', async () => {
      const result = await demo.from('projects').select('id').eq('id', demoProjectId).single()
      expect(result.error).toBeNull()
      expect(result.data?.id).toBe(demoProjectId)
    })

    it('denies demo INSERT, UPDATE, and DELETE against public rows', async () => {
      const insert = await demo.from('projects').insert({
        company_id: demoCompanyId,
        name: `${prefix}-blocked-insert`,
        status: 'draft',
      })
      expectRlsDenial(insert.error)

      const update = await demo
        .from('projects')
        .update({ name: `${prefix}-blocked-update` })
        .eq('id', demoProjectId)
        .select('id')
      expect(update.error).toBeNull()
      expect(update.data).toHaveLength(0)

      const deletion = await demo
        .from('projects')
        .delete()
        .eq('id', demoProjectId)
        .select('id')
      expect(deletion.error).toBeNull()
      expect(deletion.data).toHaveLength(0)
    })

    it('denies a normal member from mutating deterministic demo-company rows', async () => {
      const insert = await normal.from('projects').insert({
        company_id: demoCompanyId,
        name: `${prefix}-cross-demo-insert`,
        status: 'draft',
      })
      expectRlsDenial(insert.error)

      const update = await normal
        .from('projects')
        .update({ name: `${prefix}-cross-demo-update` })
        .eq('id', demoProjectId)
        .select('id')
      expect(update.error).toBeNull()
      expect(update.data).toHaveLength(0)

      const deletion = await normal
        .from('projects')
        .delete()
        .eq('id', demoProjectId)
        .select('id')
      expect(deletion.error).toBeNull()
      expect(deletion.data).toHaveLength(0)
    })

    it('preserves normal-tenant authenticated writes', async () => {
      const inserted = await normal
        .from('projects')
        .insert({
          company_id: normalCompanyId,
          name: `${prefix}-normal-project`,
          status: 'draft',
        })
        .select('id')
        .single()
      expect(inserted.error).toBeNull()
      normalProjectId = inserted.data!.id as string

      const updated = await normal
        .from('projects')
        .update({ name: `${prefix}-normal-project-updated` })
        .eq('id', normalProjectId)
        .select('name')
        .single()
      expect(updated.error).toBeNull()
      expect(updated.data?.name).toBe(`${prefix}-normal-project-updated`)

      const deleted = await normal
        .from('projects')
        .delete()
        .eq('id', normalProjectId)
        .select('id')
        .single()
      expect(deleted.error).toBeNull()
      normalProjectId = ''
    })

    it('denies demo and cross-principal Storage writes under the demo-company prefix', async () => {
      const demoInsert = await demo.storage
        .from('photos')
        .upload(`${demoCompanyId}/${prefix}-blocked-demo.png`, onePixelPng, {
          contentType: 'image/png',
          upsert: false,
        })
      expectRlsDenial(demoInsert.error)

      const demoUpdate = await demo.storage
        .from('photos')
        .update(demoObjectPath, onePixelPng, { contentType: 'image/png', upsert: true })
      expectRlsDenial(demoUpdate.error)

      const demoDelete = await demo.storage.from('photos').remove([demoObjectPath])
      expectRlsDenial(demoDelete.error)

      const normalInsert = await normal.storage
        .from('photos')
        .upload(`${demoCompanyId}/${prefix}-blocked-normal.png`, onePixelPng, {
          contentType: 'image/png',
          upsert: false,
        })
      expectRlsDenial(normalInsert.error)

      const normalDelete = await normal.storage.from('photos').remove([demoObjectPath])
      expectRlsDenial(normalDelete.error)
    })

    it('allows normal-company Storage writes and service-role demo reset operations', async () => {
      const normalUpload = await normal.storage
        .from('photos')
        .upload(normalObjectPath, onePixelPng, {
          contentType: 'image/png',
          upsert: false,
        })
      expect(normalUpload.error).toBeNull()

      const normalDelete = await normal.storage.from('photos').remove([normalObjectPath])
      expect(normalDelete.error).toBeNull()
      normalObjectPath = ''

      const reset = await service
        .from('projects')
        .update({ name: `${prefix}-service-reset` })
        .eq('id', demoProjectId)
        .select('name')
        .single()
      expect(reset.error).toBeNull()
      expect(reset.data?.name).toBe(`${prefix}-service-reset`)
    })
  },
)
