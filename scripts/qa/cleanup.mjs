import { requireQaDevelopment } from '../../tests/qa/fixtures/development.ts'

const LOOPBACK = 'http://127.0.0.1:9650'
const PAGE_SIZE = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAPTURE_FILES = {
  audio: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|mp4|ogg)$/i,
  photos: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i,
}

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

function validateAccount(row, campaignId, attempt) {
  const {
    qa_run_id: runId, qa_campaign_id: marker, qa_campaign_attempt: attemptMarker,
    qa_company_id: companyId, qa_project_id: projectId,
  } = row.raw_user_meta_data ?? {}
  if (marker !== campaignId || attemptMarker !== attempt || ![row.id, runId, companyId, projectId].every(isUuid) || row.email !== `qa-${runId}@example.invalid`) {
    throw new Error('QA cleanup refused an account without matching fixture markers')
  }
  return { id: row.id, email: row.email, campaignId, attempt, runId, companyId, projectId }
}

function verifyCompanyScope(account, companies, memberships) {
  if (companies.length > 1 || companies.some(row =>
    row.id !== account.companyId || row.user_id !== account.id || typeof row.name !== 'string' || !row.name.startsWith(`qa-${account.runId} `)
  )) {
    throw new Error('QA cleanup refused a company outside the fixture scope')
  }
  if (memberships.some(row =>
    row.user_id !== account.id || row.company_id !== companies[0]?.id || row.role !== 'owner'
  )) {
    throw new Error('QA cleanup refused a membership outside the fixture scope')
  }
}

async function inspectCompany(store, account) {
  const [companies, memberships] = await Promise.all([
    store.listCompanies(account), store.listMemberships(account),
  ])
  verifyCompanyScope(account, companies, memberships)
  return companies[0] ?? null
}

async function inspectStorage(store, account, company) {
  if (!company) return []
  const projects = await store.listProjects(account)
  if (projects.some(row => !isUuid(row.id) || row.company_id !== company.id)) {
    throw new Error('QA cleanup refused a project outside the fixture scope')
  }

  // The generated project can be absent after a partial seed or earlier removal.
  const projectIds = new Set([account.projectId, ...projects.map(row => row.id)])
  const files = []
  for (const projectId of projectIds) {
    const directory = `${company.id}/${projectId}`
    for (const [bucket, filename] of Object.entries(CAPTURE_FILES)) {
      const objects = await store.listObjects(bucket, directory)
      const seen = new Set()
      for (const object of objects) {
        if (!isUuid(object.id) || typeof object.name !== 'string' || !filename.test(object.name) || seen.has(object.name)) {
          throw new Error(`QA cleanup refused an unrecognized or duplicate ${bucket} object`)
        }
        seen.add(object.name)
      }
      if (seen.size) files.push({ bucket, paths: Array.from(seen, name => `${directory}/${name}`) })
    }
  }
  return files
}

/** Recover fixtures from one GitHub run attempt after its acceptance workers stop. */
export async function recoverQaCampaign({ env = process.env, baseURL = LOOPBACK, openStore = createStore } = {}) {
  const connection = requireQaDevelopment(baseURL, env)
  const campaignId = env.GITHUB_RUN_ID
  if (typeof campaignId !== 'string' || !/^[0-9]{1,20}$/.test(campaignId)) {
    throw new Error('QA cleanup needs a valid GitHub run ID')
  }
  // A cleanup-only rerun can have another GITHUB_RUN_ATTEMPT. Use the attempt
  // recorded by the acceptance job that seeded the fixtures.
  const attempt = env.QA_CAMPAIGN_ATTEMPT
  if (typeof attempt !== 'string' || !/^[0-9]{1,20}$/.test(attempt)) {
    throw new Error('QA cleanup needs an explicit acceptance QA_CAMPAIGN_ATTEMPT')
  }
  const store = await openStore(connection)
  const accounts = (await store.listAccounts(campaignId, attempt)).map(row => validateAccount(row, campaignId, attempt))
  for (const key of ['id', 'runId', 'companyId', 'projectId']) {
    if (new Set(accounts.map(account => account[key])).size !== accounts.length) {
      throw new Error('QA cleanup refused duplicate fixture markers')
    }
  }

  // Complete the preflight for every candidate before removing anything.
  const plan = []
  for (const account of accounts) {
    const [company, sessions] = await Promise.all([inspectCompany(store, account), store.listSessions(account.id)])
    if (sessions.some(row => !isUuid(row.id) || row.user_id !== account.id)) {
      throw new Error('QA cleanup refused a session outside the fixture scope')
    }
    const files = await inspectStorage(store, account, company)
    plan.push({ account, company, sessions, files })
  }

  const summary = { matchedAccounts: accounts.length, deletedAccounts: 0, erasedCompanies: 0, deletedSessions: 0, deletedFiles: 0 }
  for (const { account, company, sessions, files } of plan) {
    const currentRow = await store.readAccount(account.id)
    if (!currentRow) throw new Error('QA cleanup detected a missing fixture account')
    const current = validateAccount(currentRow, campaignId, attempt)
    if (Object.keys(account).some(key => account[key] !== current[key])) {
      throw new Error('QA cleanup detected a changed fixture account')
    }
    const scopedCompany = await inspectCompany(store, account)
    if (scopedCompany?.name !== company?.name) throw new Error('QA cleanup detected a changed fixture company')

    for (const { bucket, paths } of files) summary.deletedFiles += await store.removeObjects(bucket, paths)
    for (const session of sessions) summary.deletedSessions += await store.removeSession(account.id, session.id)
    if (company) {
      const fresh = await inspectCompany(store, account)
      if (fresh?.name !== company.name) throw new Error('QA cleanup detected a changed fixture company')
      await store.eraseCompany(company.id)
      summary.erasedCompanies++
    }
    const [remainingCompanies, remainingMemberships] = await Promise.all([
      store.listCompanies(account), store.listMemberships(account),
    ])
    if (remainingCompanies.length || remainingMemberships.length) {
      throw new Error('QA cleanup refused an account with remaining company ties')
    }
    if (await store.removeAccount(account) !== 1) {
      throw new Error('QA cleanup could not confirm removal of a marked fixture account')
    }
    summary.deletedAccounts++
  }
  if (plan.length && (await store.listAccounts(campaignId, attempt)).length) {
    throw new Error('QA cleanup detected remaining accounts for this acceptance attempt')
  }
  return summary
}

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

async function createStore({ supabaseOrigin, serviceKey }) {
  const { createClient } = await import('@supabase/supabase-js')
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
  }
}

if (import.meta.main) {
  try {
    const summary = await recoverQaCampaign()
    console.log('QA campaign cleanup completed.', JSON.stringify(summary))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error(message.startsWith('QA ') ? message : 'QA cleanup failed')
    process.exitCode = 1
  }
}
