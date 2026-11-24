import { createQaOnboardingFixture } from './fixtures/onboarding'
import { expect, test } from './test'

test('[QA:FIRST-COMPANY-ONBOARDING] resumes and completes the first company after owned identity', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000)
  const fixture = createQaOnboardingFixture(baseURL!)
  const origin = new URL(baseURL!).origin
  const region = 'Greater Boston'
  const next = page.getByRole('button', { name: 'Next', exact: true })
  const skip = page.getByRole('button', { name: 'Skip', exact: true })
  const phoneTitle = page.getByRole('heading', { name: "What's your phone number?", exact: true })
  const industryTitle = page.getByRole('heading', { name: 'Which services does your business offer?', exact: true })
  let externalIdentityPosts = 0
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === origin && url.pathname === '/api/auth/identity' && request.method() === 'POST') externalIdentityPosts++
  })
  info.annotations.push({ type: 'identity-source', description: 'Synthetic owned account and session start after identity verification.' })

  try {
    await fixture.seed()
    const allowance = await fixture.expectedSignupCredits()
    expect(await fixture.readState()).toEqual({ companies: [], memberships: [], drafts: [] })
    await page.context().addCookies(fixture.cookies())
    const session = await page.request.get('/api/auth/session', { maxRedirects: 0 })
    expect(session.status()).toBe(200)
    expect((await session.json()).user?.id).toBe(fixture.userId)
    expect((await page.goto('/onboarding'))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Which language would you like to use Xtimator in?', exact: true })).toBeVisible()
    await next.click()
    const name = page.getByRole('textbox', { name: 'Company Name', exact: true })
    await expect(name).toHaveValue('')
    await name.fill(fixture.companyName)
    await next.click()
    await expect(phoneTitle).toBeVisible()
    await skip.click()
    await expect(industryTitle).toBeVisible()

    // The debounced Server Action must store the step before testing reload.
    await expect.poll(async () => (await fixture.readState()).drafts).toMatchObject([
      { mode: 'first', step: 'industry', completed_at: null, values: { companyName: fixture.companyName } },
    ])
    const { drafts: [saved] } = await fixture.readState()
    expect(saved.revision).toBeGreaterThan(0)
    const draftKey = `xtimator_onboarding_first_${saved.id}`
    await page.evaluate(key => localStorage.removeItem(key), draftKey)
    expect((await page.reload())?.status()).toBe(200)
    await expect(industryTitle).toBeVisible()
    await page.getByRole('button', { name: 'Construction & Remodeling', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Painting', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Start with suggested prices.' })).not.toBeChecked()
    await next.click()
    await page.getByRole('textbox', { name: 'Service area', exact: true }).fill(region)
    await next.click()
    await expect(page.getByRole('heading', { name: 'Pick a brand color', exact: true })).toBeVisible()
    await next.click()
    await expect(page.getByRole('heading', { name: 'Upload your logo', exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Receive estimate, billing and system updates from Xtimator on WhatsApp/ })).not.toBeChecked()
    await page.getByRole('button', { name: 'Start using Xtimator', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/dashboard`)

    const final = await fixture.readState()
    expect(final.companies).toHaveLength(1)
    const [company] = final.companies
    expect(company).toMatchObject({ name: fixture.companyName, user_id: fixture.userId, tier: 'free',
      owner_name: fixture.ownerName, email: fixture.email, phone: null, industry: 'painting', city: region,
      logo_url: null, credit_balance: allowance })
    expect(final.memberships).toEqual([{ company_id: company.id, user_id: fixture.userId, role: 'owner' }])
    expect(final.drafts).toMatchObject([{ id: saved.id, mode: 'first', completed_company_id: company.id,
      completed_at: expect.any(String), values: { companyName: fixture.companyName, industries: ['painting'], city: region, prefillPriceBook: false } }])
    const active = (await page.context().cookies()).find(cookie => cookie.name === 'active_company_id')
    expect(active?.value).toBe(company.id)

    const credits = await fixture.readCredits(company.id)
    expect(credits.lots).toHaveLength(1)
    expect(credits.ledger).toHaveLength(1)
    expect(credits.lots).toMatchObject([{ source: 'signup', granted: allowance, remaining: allowance, expires_at: null }])
    expect(credits.ledger).toMatchObject([{ idempotency_key: `signup:${company.id}`, reason: 'grant',
      delta_credits: allowance, lot_id: credits.lots[0].id }])

    expect((await page.reload())?.status()).toBe(200)
    await page.goto('/onboarding')
    await expect(page).toHaveURL(`${origin}/dashboard`)
    expect(await fixture.readState()).toEqual(final)
    expect(await fixture.readCredits(company.id)).toEqual(credits)
    expect(externalIdentityPosts).toBe(0)
  } finally {
    try { await page.close() } finally { await fixture.cleanup() }
  }
})
