const { ONBOARDING_FIXTURE_KIND } = require('./onboarding-cleanup.cjs')

const PAGE_SIZE = 100

function rows(result, operation) {
  if (result.error || !Array.isArray(result.data)) throw new Error(`QA cleanup could not ${operation}`)
  return result.data
}

async function pages(load, operation) {
  const data = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = rows(await load(offset), operation)
    data.push(...page)
    if (page.length < PAGE_SIZE) return data
  }
}

async function createQaCleanupStore({ supabaseOrigin, serviceKey }) {
  const { createClient } = require('@supabase/supabase-js')
  const db = createClient(supabaseOrigin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, redirect: 'error' }) },
  })
  const list = (query, operation) => pages(offset => query().range(offset, offset + PAGE_SIZE - 1), operation)

  return {
    listAccounts: (campaignId, attempt) => list(() => db.from('xtimator_accounts').select('id,email,raw_user_meta_data')
      .eq('raw_user_meta_data->>qa_campaign_id', campaignId)
      .eq('raw_user_meta_data->>qa_campaign_attempt', attempt).order('id'), 'list campaign accounts'),
    async readAccount(userId) {
      const result = await db.from('xtimator_accounts').select('id,email,raw_user_meta_data').eq('id', userId).maybeSingle()
      if (result.error) throw new Error('QA cleanup could not recheck fixture account markers')
      return result.data
    },
    listCompanies: account => list(() => db.from('companies').select('id,user_id,name')
      .or(`user_id.eq.${account.id},id.eq.${account.companyId}`).order('id'), 'verify company ownership'),
    listMemberships: account => list(() => db.from('company_members').select('company_id,user_id,role')
      .or(`user_id.eq.${account.id},company_id.eq.${account.companyId}`).order('company_id').order('user_id'), 'verify company memberships'),
    listProjects: account => list(() => db.from('projects').select('id,company_id')
      .or(`company_id.eq.${account.companyId},id.eq.${account.projectId}`).order('id'), 'verify project prefixes'),
    listOnboardingCompanies: (account, companyId) => list(() => {
      const scope = [`user_id.eq.${account.id}`, `name.eq.${account.companyName}`]
      if (companyId) scope.push(`id.eq.${companyId}`)
      return db.from('companies').select('id,user_id,name').or(scope.join(',')).order('id')
    }, 'verify onboarding company ownership'),
    listOnboardingMemberships: (account, companyId) => list(() => {
      const query = db.from('company_members').select('company_id,user_id,role')
      return (companyId ? query.or(`user_id.eq.${account.id},company_id.eq.${companyId}`) : query.eq('user_id', account.id))
        .order('company_id').order('user_id')
    }, 'verify onboarding company memberships'),
    listOnboardingDrafts: (account, companyId) => list(() => {
      const query = db.from('onboarding_drafts').select('id,user_id,mode,completed_company_id')
      return (companyId ? query.or(`user_id.eq.${account.id},completed_company_id.eq.${companyId}`) : query.eq('user_id', account.id))
        .order('id')
    }, 'verify onboarding drafts'),
    listOnboardingProjects: companyId => list(() => db.from('projects').select('id').eq('company_id', companyId)
      .order('id'), 'verify onboarding company has no projects'),
    async hasOnboardingStorage(userId, companyId) {
      const buckets = rows(await db.storage.listBuckets(), 'list storage buckets for onboarding cleanup')
      for (const bucket of buckets) {
        for (const prefix of new Set(companyId ? [userId, companyId] : [userId])) {
          const objects = rows(await db.storage.from(bucket.id).list(prefix, { limit: 1 }), 'check onboarding storage prefix')
          if (objects.length) return true
        }
      }
      return false
    },
    listSessions: userId => list(() => db.from('xtimator_sessions').select('id,user_id')
      .eq('user_id', userId).order('id'), 'list fixture sessions'),
    listObjects: (bucket, directory) => pages(offset => db.storage.from(bucket).list(directory, {
      offset, limit: PAGE_SIZE, sortBy: { column: 'name', order: 'asc' },
    }), `list ${bucket} objects`),
    async removeObjects(bucket, paths) {
      let removed = 0
      for (let offset = 0; offset < paths.length; offset += PAGE_SIZE) {
        removed += rows(await db.storage.from(bucket).remove(paths.slice(offset, offset + PAGE_SIZE)), `remove ${bucket} objects`).length
      }
      return removed
    },
    async removeSession(userId, sessionId) {
      return rows(await db.from('xtimator_sessions').delete().eq('id', sessionId).eq('user_id', userId)
        .select('id'), 'remove a fixture session').length
    },
    async eraseCompany(companyId) {
      const result = await db.rpc('erase_company_for_compliance', { p_company_id: companyId })
      if (result.error) throw new Error('QA cleanup could not erase a fixture company')
    },
    async removeAccount(account) {
      return rows(await db.from('xtimator_accounts').delete().eq('id', account.id).eq('email', account.email)
        .eq('raw_user_meta_data->>qa_campaign_id', account.campaignId)
        .eq('raw_user_meta_data->>qa_campaign_attempt', account.attempt)
        .eq('raw_user_meta_data->>qa_run_id', account.runId)
        .eq('raw_user_meta_data->>qa_company_id', account.companyId)
        .eq('raw_user_meta_data->>qa_project_id', account.projectId)
        .select('id'), 'remove a fixture account').length
    },
    async removeOnboardingAccount(account) {
      return rows(await db.from('xtimator_accounts').delete().eq('id', account.id).eq('email', account.email)
        .eq('raw_user_meta_data->>qa_kind', ONBOARDING_FIXTURE_KIND)
        .eq('raw_user_meta_data->>qa_campaign_id', account.campaignId)
        .eq('raw_user_meta_data->>qa_campaign_attempt', account.attempt)
        .eq('raw_user_meta_data->>qa_run_id', account.runId)
        .eq('raw_user_meta_data->>qa_expected_company_name', account.companyName)
        .select('id'), 'remove an onboarding fixture account').length
    },
  }
}

module.exports = { createQaCleanupStore }
