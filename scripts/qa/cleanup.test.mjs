import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recoverQaCampaign } from './cleanup.mjs'
import { expectedOnboardingCompanyName } from './onboarding-cleanup.mjs'

const CAMPAIGN = '10783590211'
const ATTEMPT = '2'
const ENV = {
  XTIMATOR_QA_DEV: '1', DATA_API_MODE: 'supabase', NEXT_PUBLIC_AUTH_MODE: 'owned',
  NEXT_PUBLIC_SUPABASE_URL: 'https://prmqgcrnpuvpzruyzvuv.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key', GITHUB_RUN_ID: CAMPAIGN, QA_CAMPAIGN_ATTEMPT: ATTEMPT,
}
const id = value => `16000000-0000-4000-8000-${String(value).padStart(12, '0')}`

function createFixture(start) {
  const [accountId, runId, companyId, projectId, sessionId, fileId] = Array.from({ length: 6 }, (_, index) => id(start + index))
  const account = {
    id: accountId,
    email: `qa-${runId}@example.invalid`,
    raw_user_meta_data: {
      qa_campaign_id: CAMPAIGN, qa_campaign_attempt: ATTEMPT, qa_run_id: runId, qa_company_id: companyId, qa_project_id: projectId,
    },
  }
  return {
    account,
    company: { id: companyId, user_id: accountId, name: `qa-${runId} Company` },
    membership: { company_id: companyId, user_id: accountId, role: 'owner' },
    project: { id: projectId, company_id: companyId },
    session: { id: sessionId, user_id: accountId },
    directory: `${companyId}/${projectId}`,
    audio: { id: fileId, name: `${fileId}.webm` },
    photo: { id: fileId, name: `${fileId}.webp` },
  }
}

function fakeStore(fixtures, { keepMembershipAfterErase = false } = {}) {
  const writes = []
  const campaignReads = []
  const storageReads = []
  let accounts = fixtures.map(fixture => fixture.account)
  let companies = fixtures.flatMap(fixture => fixture.company ? [fixture.company] : [])
  let memberships = fixtures.flatMap(fixture => fixture.membership ? [fixture.membership] : [])
  const projects = fixtures.flatMap(fixture => fixture.project ? [fixture.project] : [])
  let sessions = fixtures.flatMap(fixture => fixture.session ? [fixture.session] : [])
  const objects = new Map(fixtures.flatMap(fixture => [
    [`audio:${fixture.directory}`, fixture.audio ? [fixture.audio] : []],
    [`photos:${fixture.directory}`, fixture.photo ? [fixture.photo] : []],
  ]))
  const store = {
    async listAccounts(campaignId, attempt) {
      campaignReads.push([campaignId, attempt])
      return accounts
    },
    async readAccount(userId) {
      return accounts.find(row => row.id === userId) ?? null
    },
    async listCompanies(account) {
      return companies.filter(row => row.user_id === account.id || row.id === account.companyId)
    },
    async listMemberships(account) {
      return memberships.filter(row => row.user_id === account.id || row.company_id === account.companyId)
    },
    async listProjects(account) {
      return projects.filter(row => row.company_id === account.companyId || row.id === account.projectId)
    },
    async listSessions(userId) {
      return sessions.filter(row => row.user_id === userId)
    },
    async listObjects(bucket, directory) {
      storageReads.push([bucket, directory])
      return objects.get(`${bucket}:${directory}`) ?? []
    },
    async removeObjects(bucket, paths) {
      writes.push(['removeObjects', bucket, paths])
      return paths.length
    },
    async removeSession(userId, sessionId) {
      writes.push(['removeSession', userId, sessionId])
      sessions = sessions.filter(row => row.user_id !== userId || row.id !== sessionId)
      return 1
    },
    async eraseCompany(companyId) {
      writes.push(['eraseCompany', companyId])
      companies = companies.filter(row => row.id !== companyId)
      if (!keepMembershipAfterErase) memberships = memberships.filter(row => row.company_id !== companyId)
    },
    async removeAccount(account) {
      writes.push(['removeAccount', account.id, account.email, account.campaignId, account.attempt, account.runId])
      accounts = accounts.filter(row => row.id !== account.id)
      return 1
    },
  }
  return { store, writes, campaignReads, storageReads }
}

function mixedCampaign({ rejectOnboarding = false } = {}) {
  const regular = createFixture(1)
  const onboarding = createFixture(20)
  const meta = onboarding.account.raw_user_meta_data
  delete meta.qa_company_id
  delete meta.qa_project_id
  meta.qa_kind = 'onboarding'
  meta.qa_expected_company_name = expectedOnboardingCompanyName(meta.qa_run_id)
  onboarding.company.name = rejectOnboarding ? 'Unrecognized name' : meta.qa_expected_company_name
  onboarding.project = null
  onboarding.audio = null
  onboarding.photo = null
  const { store, writes } = fakeStore([regular, onboarding])
  Object.assign(store, {
    listOnboardingCompanies: (account, companyId) => store.listCompanies({ ...account, companyId }),
    listOnboardingMemberships: (account, companyId) => store.listMemberships({ ...account, companyId }),
    listOnboardingDrafts: async () => [],
    listOnboardingProjects: async companyId => store.listProjects({ companyId }),
    hasOnboardingStorage: async () => false,
    removeOnboardingAccount: async account => store.removeAccount(account),
  })
  return { store, writes }
}

test('preflights onboarding and preallocated fixtures before making any campaign deletions', async () => {
  const { store, writes } = mixedCampaign({ rejectOnboarding: true })
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /onboarding cleanup refused a company/)
  assert.deepEqual(writes, [])
})

test('aggregates cleanup and verifies absence of both campaign fixture types', async () => {
  const { store } = mixedCampaign()
  assert.deepEqual(await recoverQaCampaign({ env: ENV, openStore: () => store }), {
    matchedAccounts: 2, deletedAccounts: 2, erasedCompanies: 2, deletedSessions: 2, deletedFiles: 2,
  })
  assert.deepEqual(await store.listAccounts(CAMPAIGN, ATTEMPT), [])
})

test('refuses an unknown fixture purpose before deleting any campaign account', async () => {
  const fixture = createFixture(1)
  fixture.account.raw_user_meta_data.qa_kind = 'unknown'
  const { store, writes } = fakeStore([fixture])
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /unrecognized preallocated fixture kind/)
  assert.deepEqual(writes, [])
})

test('requires a valid campaign and the exact development safety boundary before opening the store', async () => {
  let opens = 0
  const openStore = () => { opens++ }
  const cases = [
    [{ GITHUB_RUN_ID: undefined }, /GitHub run ID/],
    [{ GITHUB_RUN_ID: '123/456' }, /GitHub run ID/],
    [{ GITHUB_RUN_ID: '123456789012345678901' }, /GitHub run ID/],
    [{ QA_CAMPAIGN_ATTEMPT: undefined, GITHUB_RUN_ATTEMPT: ATTEMPT }, /explicit acceptance QA_CAMPAIGN_ATTEMPT/],
    [{ QA_CAMPAIGN_ATTEMPT: '2/3' }, /explicit acceptance QA_CAMPAIGN_ATTEMPT/],
    [{ XTIMATOR_QA_DEV: '0' }, /XTIMATOR_QA_DEV/],
    [{ DATA_API_MODE: 'postgres' }, /DATA_API_MODE/],
    [{ NEXT_PUBLIC_AUTH_MODE: 'supabase' }, /NEXT_PUBLIC_AUTH_MODE/],
    [{ NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, /development origin/],
    [{ DATA_API_UPSTREAM_URL: 'https://other.supabase.co' }, /development origin/],
  ]
  for (const [changes, expected] of cases) {
    await assert.rejects(recoverQaCampaign({ env: { ...ENV, ...changes }, openStore }), expected)
  }
  await assert.rejects(recoverQaCampaign({ env: ENV, baseURL: 'https://example.invalid', openStore }), /loopback/)
  assert.equal(opens, 0)
})

test('matches only the selected acceptance attempt and erases exactly the validated fixture', async () => {
  const fixture = createFixture(1)
  const { store, writes, storageReads, campaignReads } = fakeStore([fixture])
  const options = { env: { ...ENV, GITHUB_RUN_ATTEMPT: '3' }, openStore: () => store }
  assert.deepEqual(await recoverQaCampaign(options), {
    matchedAccounts: 1, deletedAccounts: 1, erasedCompanies: 1, deletedSessions: 1, deletedFiles: 2,
  })
  assert.deepEqual(storageReads, [['audio', fixture.directory], ['photos', fixture.directory]])
  assert.deepEqual(writes, [
    ['removeObjects', 'audio', [`${fixture.directory}/${fixture.audio.name}`]],
    ['removeObjects', 'photos', [`${fixture.directory}/${fixture.photo.name}`]],
    ['removeSession', fixture.account.id, fixture.session.id],
    ['eraseCompany', fixture.company.id],
    ['removeAccount', fixture.account.id, fixture.account.email, CAMPAIGN, ATTEMPT, fixture.account.raw_user_meta_data.qa_run_id],
  ])
  assert.deepEqual(await recoverQaCampaign(options), {
    matchedAccounts: 0, deletedAccounts: 0, erasedCompanies: 0, deletedSessions: 0, deletedFiles: 0,
  })
  assert.deepEqual(campaignReads, [[CAMPAIGN, ATTEMPT], [CAMPAIGN, ATTEMPT], [CAMPAIGN, ATTEMPT]])
  assert.equal(writes.length, 5)
})

test('recovers an account left by a partial seed before company creation', async () => {
  const fixture = createFixture(1)
  const { store, writes, storageReads } = fakeStore([{ account: fixture.account }])
  assert.deepEqual(await recoverQaCampaign({ env: ENV, openStore: () => store }), {
    matchedAccounts: 1, deletedAccounts: 1, erasedCompanies: 0, deletedSessions: 0, deletedFiles: 0,
  })
  assert.deepEqual(storageReads, [])
  assert.equal(writes[0][0], 'removeAccount')
})

for (const [description, corrupt, error] of [
  ['foreign campaign marker', fixture => { fixture.account.raw_user_meta_data.qa_campaign_id = '99' }, /account/],
  ['foreign acceptance attempt', fixture => { fixture.account.raw_user_meta_data.qa_campaign_attempt = '99' }, /account/],
  ['invalid run ID marker', fixture => { fixture.account.raw_user_meta_data.qa_run_id = 'bad' }, /account/],
  ['unmarked email', fixture => { fixture.account.email = 'another@example.invalid' }, /account/],
  ['unmarked company', fixture => { fixture.company.name = 'Another Company' }, /company/],
  ['foreign owner', fixture => { fixture.company.user_id = id(99) }, /company/],
  ['member of a foreign company', fixture => { fixture.membership.company_id = id(99) }, /membership/],
  ['foreign account member of fixture company', fixture => { fixture.membership.user_id = id(99) }, /membership/],
  ['marked project belonging to another company', fixture => { fixture.project.company_id = id(99) }, /project/],
  ['unrecognized file', fixture => { fixture.audio.name = '../unmarked.webm' }, /unrecognized.*audio/],
  ['storage subdirectory', fixture => { fixture.photo.id = null }, /unrecognized.*photos/],
]) {
  test(`${description} aborts recovery before any fixture is touched`, async () => {
    const good = createFixture(1)
    const bad = createFixture(11)
    corrupt(bad)
    const { store, writes } = fakeStore([good, bad])
    await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), error)
    assert.deepEqual(writes, [])
  })
}

test('an undeleted membership prevents the final account deletion', async () => {
  const fixture = createFixture(1)
  const { store, writes } = fakeStore([fixture], { keepMembershipAfterErase: true })
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /remaining company ties/)
  assert.ok(writes.some(([operation]) => operation === 'eraseCompany'))
  assert.ok(!writes.some(([operation]) => operation === 'removeAccount'))
})

test('a marker changed after the preflight prevents removal', async () => {
  const fixture = createFixture(1)
  const { store, writes } = fakeStore([fixture])
  store.readAccount = async () => ({
    ...fixture.account,
    raw_user_meta_data: { ...fixture.account.raw_user_meta_data, qa_project_id: id(100) },
  })
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /changed fixture account/)
  assert.deepEqual(writes, [])
})

test('does not report success when the account delete touched no row', async () => {
  const fixture = createFixture(1)
  const { store } = fakeStore([fixture])
  store.removeAccount = async () => 0
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /confirm removal/)
})

test('does not report success while matching accounts still remain', async () => {
  const fixture = createFixture(1)
  const { store } = fakeStore([fixture])
  store.removeAccount = async () => 1
  await assert.rejects(recoverQaCampaign({ env: ENV, openStore: () => store }), /remaining accounts/)
})
