const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_MARKER = /^\d{1,20}$/
export const ONBOARDING_FIXTURE_KIND = 'onboarding'

const isUuid = value => typeof value === 'string' && UUID.test(value)
const isNumericMarker = value => typeof value === 'string' && NUMERIC_MARKER.test(value)
export const expectedOnboardingCompanyName = runId => `qa-${runId} First company`

export function validateOnboardingAccount(row, campaignId, attempt) {
  const meta = row?.raw_user_meta_data ?? {}
  const runId = meta.qa_run_id
  const companyName = expectedOnboardingCompanyName(runId)
  if (meta.qa_kind !== ONBOARDING_FIXTURE_KIND || !isUuid(row?.id) || !isUuid(runId)
    || !isNumericMarker(campaignId) || !isNumericMarker(attempt)
    || meta.qa_campaign_id !== campaignId || meta.qa_campaign_attempt !== attempt
    || row.email !== `qa-${runId}@example.invalid` || meta.qa_expected_company_name !== companyName
    || 'qa_company_id' in meta || 'qa_project_id' in meta) {
    throw new Error('QA onboarding cleanup refused an account without matching fixture markers')
  }
  return { id: row.id, email: row.email, campaignId, attempt, runId, companyName }
}

async function inspectScope(store, account, priorCompanyId) {
  const companies = await store.listOnboardingCompanies(account, priorCompanyId)
  if (companies.length > 1 || companies.some(company => !isUuid(company.id)
    || company.user_id !== account.id || company.name !== account.companyName
    || (priorCompanyId && company.id !== priorCompanyId))) {
    throw new Error('QA onboarding cleanup refused a company outside the fixture scope')
  }
  const companyId = companies[0]?.id ?? null
  const scopeCompanyId = companyId ?? priorCompanyId
  const [members, drafts, projects, hasStorage] = await Promise.all([
    store.listOnboardingMemberships(account, scopeCompanyId),
    store.listOnboardingDrafts(account, scopeCompanyId),
    scopeCompanyId ? store.listOnboardingProjects(scopeCompanyId) : [],
    store.hasOnboardingStorage(account.id, scopeCompanyId),
  ])
  if (members.length > 1 || members.some(member =>
    member.user_id !== account.id || member.company_id !== companyId || member.role !== 'owner')) {
    throw new Error('QA onboarding cleanup refused a membership outside the fixture scope')
  }
  if (drafts.length > 1 || drafts.some(draft => !isUuid(draft.id) || draft.user_id !== account.id || draft.mode !== 'first'
    || (draft.completed_company_id !== null && (!companyId || draft.completed_company_id !== companyId)))) {
    throw new Error('QA onboarding cleanup refused a draft outside the fixture scope')
  }
  if (projects.length) throw new Error('QA onboarding cleanup refused a company with projects')
  if (hasStorage) throw new Error('QA onboarding cleanup refused storage under a fixture prefix')
  return { companyId, membership: members.length === 1, draftId: drafts[0]?.id ?? null,
    draftCompanyId: drafts[0]?.completed_company_id ?? null }
}

async function readSessionIds(store, account) {
  const sessions = await store.listSessions(account.id)
  if (sessions.length > 1 || sessions.some(row => !isUuid(row.id) || row.user_id !== account.id)) {
    throw new Error('QA onboarding cleanup refused a session outside the fixture scope')
  }
  return sessions.map(row => row.id)
}

export async function prepareOnboardingCleanup(store, account) {
  const [scope, sessionIds] = await Promise.all([inspectScope(store, account, null), readSessionIds(store, account)])
  return { account, scope, sessionIds }
}

export async function executeOnboardingCleanup(store, plan) {
  const { account, scope, sessionIds } = plan
  const current = validateOnboardingAccount(await store.readAccount(account.id), account.campaignId, account.attempt)
  if (Object.keys(account).some(key => account[key] !== current[key])) {
    throw new Error('QA onboarding cleanup detected changed account markers')
  }
  const [confirmed, currentSessions] = await Promise.all([
    inspectScope(store, current, scope.companyId), readSessionIds(store, current),
  ])
  if (Object.keys(scope).some(key => scope[key] !== confirmed[key]) || currentSessions.join() !== sessionIds.join()) {
    throw new Error('QA onboarding cleanup detected changed fixture scope')
  }
  for (const sessionId of sessionIds) {
    if (await store.removeSession(account.id, sessionId) !== 1) {
      throw new Error('QA onboarding cleanup could not confirm removal of its session')
    }
  }
  if (scope.companyId) await store.eraseCompany(scope.companyId)
  const residue = await inspectScope(store, current, scope.companyId)
  if (residue.companyId || residue.membership || (await readSessionIds(store, account)).length) {
    throw new Error('QA onboarding cleanup detected remaining company or session rows')
  }
  if (await store.removeOnboardingAccount(account) !== 1 || await store.readAccount(account.id)) {
    throw new Error('QA onboarding cleanup could not confirm removal of its account')
  }
  if ((await store.listOnboardingDrafts(account, scope.companyId)).length) {
    throw new Error('QA onboarding cleanup detected a remaining draft')
  }
  return { deletedAccounts: 1, erasedCompanies: scope.companyId ? 1 : 0, deletedSessions: sessionIds.length }
}
