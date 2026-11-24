import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  executeOnboardingCleanup, expectedOnboardingCompanyName, prepareOnboardingCleanup, validateOnboardingAccount,
} from './onboarding-cleanup.mjs'

const CAMPAIGN = '45432100000'
const ATTEMPT = '3'
const uuid = value => `67000000-0000-4000-8000-${String(value).padStart(12, '0')}`

function fixture({ stage = 'complete' } = {}) {
  const [userId, runId, companyId, draftId, sessionId] = [1, 2, 3, 4, 5].map(uuid)
  const companyName = expectedOnboardingCompanyName(runId)
  const state = {
    account: { id: userId, email: `qa-${runId}@example.invalid`, raw_user_meta_data: {
      qa_kind: 'onboarding', qa_run_id: runId, qa_campaign_id: CAMPAIGN, qa_campaign_attempt: ATTEMPT,
      qa_expected_company_name: companyName,
    } },
    companies: stage === 'before-company' ? [] : [{ id: companyId, user_id: userId, name: companyName }],
    members: stage === 'complete' ? [{ company_id: companyId, user_id: userId, role: 'owner' }] : [],
    drafts: [{ id: draftId, user_id: userId, mode: 'first', completed_company_id: stage === 'complete' ? companyId : null }],
    sessions: [{ id: sessionId, user_id: userId }], projects: [], storage: false,
  }
  const writes = []
  const store = {
    async readAccount(id) { assert.equal(id, userId); return state.account },
    async listOnboardingCompanies() { return state.companies },
    async listOnboardingMemberships() { return state.members },
    async listOnboardingDrafts() { return state.drafts },
    async listOnboardingProjects(id) { assert.equal(id, companyId); return state.projects },
    async hasOnboardingStorage(id, company) { assert.equal(id, userId); assert.ok(company === null || company === companyId); return state.storage },
    async listSessions(id) { assert.equal(id, userId); return state.sessions },
    async removeSession(id, session) {
      assert.equal(id, userId); assert.equal(session, sessionId)
      writes.push('session'); state.sessions = []; return 1
    },
    async eraseCompany(id) {
      assert.equal(id, companyId)
      writes.push('company'); state.companies = []; state.members = []
      for (const draft of state.drafts) draft.completed_company_id = null
    },
    async removeOnboardingAccount(account) {
      assert.deepEqual(account, { id: userId, email: state.account.email, runId, campaignId: CAMPAIGN, attempt: ATTEMPT, companyName })
      writes.push('account'); state.account = null; state.drafts = []; return 1
    },
  }
  return { store, state, writes, runId, userId, companyId }
}

for (const stage of ['before-company', 'partial-insert', 'complete']) {
  test(`onboarding cleanup only erases validated rows at stage ${stage}`, async () => {
    const { store, state, writes } = fixture({ stage })
    const account = validateOnboardingAccount(state.account, CAMPAIGN, ATTEMPT)
    const plan = await prepareOnboardingCleanup(store, account)
    assert.deepEqual(writes, [])
    const company = stage !== 'before-company'
    assert.deepEqual(await executeOnboardingCleanup(store, plan), {
      deletedAccounts: 1, erasedCompanies: company ? 1 : 0, deletedSessions: 1,
    })
    assert.deepEqual(writes, company ? ['session', 'company', 'account'] : ['session', 'account'])
    assert.equal(state.account, null)
    assert.deepEqual(state.drafts, [])
  })
}

const invalidScopes = [
  ['foreign company name', state => { state.companies[0].name += ' Copy' }, /company outside/],
  ['foreign company owner', state => { state.companies[0].user_id = uuid(9) }, /company outside/],
  ['second company', state => { state.companies.push({ ...state.companies[0], id: uuid(9) }) }, /company outside/],
  ['foreign member in the company', state => { state.members[0].user_id = uuid(9) }, /membership outside/],
  ['membership in another company', state => { state.members[0].company_id = uuid(9) }, /membership outside/],
  ['unexpected membership role', state => { state.members[0].role = 'admin' }, /membership outside/],
  ['company project', state => { state.projects = [{ id: uuid(9) }] }, /with projects/],
  ['storage object', state => { state.storage = true }, /storage under/],
  ['different completed draft company', state => { state.drafts[0].completed_company_id = uuid(9) }, /draft outside/],
  ['foreign draft referencing the company', state => { state.drafts[0].user_id = uuid(9) }, /draft outside/],
  ['unmarked session owner', state => { state.sessions[0].user_id = uuid(9) }, /session outside/],
]
for (const [name, mutate, error] of invalidScopes) {
  test(`onboarding cleanup refuses ${name} before deletes`, async () => {
    const { store, state, writes } = fixture()
    const account = validateOnboardingAccount(state.account, CAMPAIGN, ATTEMPT)
    mutate(state)
    await assert.rejects(prepareOnboardingCleanup(store, account), error)
    assert.deepEqual(writes, [])
  })
}

test('onboarding cleanup rejects campaign, attempt, name marker, kind and ambiguous seeded IDs', () => {
  const { state } = fixture()
  const check = row => validateOnboardingAccount(row, CAMPAIGN, ATTEMPT)
  for (const mutation of [
    { qa_campaign_id: '45432100001' }, { qa_campaign_attempt: '4' }, { qa_run_id: 'invalid' },
    { qa_expected_company_name: 'Unmarked company' }, { qa_kind: 'unknown' }, { qa_company_id: uuid(9) },
  ]) {
    assert.throws(() => check({ ...state.account, raw_user_meta_data: { ...state.account.raw_user_meta_data, ...mutation } }), /matching fixture markers/)
  }
  assert.throws(() => check({ ...state.account, email: 'real@example.com' }), /matching fixture markers/)
  assert.throws(() => validateOnboardingAccount(state.account, CAMPAIGN, ''), /matching fixture markers/)
})

for (const [description, change] of [
  ['company ID', state => { state.companies[0].id = uuid(9) }],
  ['owner membership', state => { state.members = [] }],
  ['account attempt marker', state => { state.account.raw_user_meta_data.qa_campaign_attempt = '4' }],
]) {
  test(`onboarding cleanup detects changed ${description} before deletion`, async () => {
    const { store, state, writes } = fixture()
    const account = validateOnboardingAccount(state.account, CAMPAIGN, ATTEMPT)
    const plan = await prepareOnboardingCleanup(store, account)
    change(state)
    await assert.rejects(executeOnboardingCleanup(store, plan), /changed fixture scope|company outside|matching fixture markers/)
    assert.deepEqual(writes, [])
  })
}

test('onboarding cleanup requires a positive readback of account erasure', async () => {
  const { store, state } = fixture()
  const account = validateOnboardingAccount(state.account, CAMPAIGN, ATTEMPT)
  const plan = await prepareOnboardingCleanup(store, account)
  store.removeOnboardingAccount = async () => 1
  await assert.rejects(executeOnboardingCleanup(store, plan), /could not confirm removal of its account/)
})
