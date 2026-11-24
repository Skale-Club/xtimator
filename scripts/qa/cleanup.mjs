import { requireQaDevelopment } from '../../tests/qa/fixtures/development.ts'
import cleanupStore from './cleanup-store.cjs'
import onboardingCleanup from './onboarding-cleanup.cjs'

const { executeOnboardingCleanup, ONBOARDING_FIXTURE_KIND, prepareOnboardingCleanup, validateOnboardingAccount } = onboardingCleanup
export const { createQaCleanupStore } = cleanupStore

const LOOPBACK = 'http://127.0.0.1:9650'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAPTURE_FILES = {
  audio: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|mp4|ogg)$/i,
  photos: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i,
}

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

function validateAccount(row, campaignId, attempt) {
  if ('qa_kind' in (row.raw_user_meta_data ?? {})) {
    throw new Error('QA cleanup refused an unrecognized preallocated fixture kind')
  }
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
export async function recoverQaCampaign({ env = process.env, baseURL = LOOPBACK, openStore = createQaCleanupStore } = {}) {
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
  const accounts = []
  const onboardingAccounts = []
  for (const row of await store.listAccounts(campaignId, attempt)) {
    if (row.raw_user_meta_data?.qa_kind === ONBOARDING_FIXTURE_KIND) {
      onboardingAccounts.push(validateOnboardingAccount(row, campaignId, attempt))
    } else {
      accounts.push(validateAccount(row, campaignId, attempt))
    }
  }
  const allAccounts = [...accounts, ...onboardingAccounts]
  for (const key of ['id', 'runId']) {
    if (new Set(allAccounts.map(account => account[key])).size !== allAccounts.length) {
      throw new Error('QA cleanup refused duplicate fixture markers')
    }
  }
  for (const key of ['companyId', 'projectId']) {
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
  const onboardingPlan = []
  for (const account of onboardingAccounts) onboardingPlan.push(await prepareOnboardingCleanup(store, account))
  const companyIds = [...accounts.map(account => account.companyId),
    ...onboardingPlan.flatMap(fixture => fixture.scope.companyId ? [fixture.scope.companyId] : [])]
  if (new Set(companyIds).size !== companyIds.length) throw new Error('QA cleanup refused duplicate fixture companies')

  const summary = { matchedAccounts: allAccounts.length, deletedAccounts: 0, erasedCompanies: 0, deletedSessions: 0, deletedFiles: 0 }
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
  for (const item of onboardingPlan) {
    const result = await executeOnboardingCleanup(store, item)
    summary.deletedAccounts += result.deletedAccounts
    summary.erasedCompanies += result.erasedCompanies
    summary.deletedSessions += result.deletedSessions
  }
  if (allAccounts.length && (await store.listAccounts(campaignId, attempt)).length) {
    throw new Error('QA cleanup detected remaining accounts for this acceptance attempt')
  }
  return summary
}

if (import.meta.main) {
  void recoverQaCampaign().then(summary => {
    console.log('QA campaign cleanup completed.', JSON.stringify(summary))
  }).catch(error => {
    const message = error instanceof Error ? error.message : ''
    console.error(message.startsWith('QA ') ? message : 'QA cleanup failed')
    process.exitCode = 1
  })
}
