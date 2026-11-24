/** Only an explicitly isolated campaign using development data may narrow workers. */
export function isQaDevelopmentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.XTIMATOR_QA_DEV !== '1') return false
  let origin: string
  try { origin = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin }
  catch { throw new Error('QA runtime requires an explicit development data origin') }
  const compiledCampaign = env.NODE_ENV === 'production' && env.XTIMATOR_QA_PRODUCTION_BUILD === '1' &&
    env.GITHUB_ACTIONS === 'true' && env.APP_ORIGIN === 'https://127.0.0.1:9650' &&
    env.NEXT_PUBLIC_SITE_URL === 'https://127.0.0.1:9650' && env.INNGEST_SERVE_HOST === 'http://127.0.0.1:9652'
  if ((!compiledCampaign && env.NODE_ENV !== 'development') || env.DATA_API_MODE !== 'supabase' ||
      env.NEXT_PUBLIC_AUTH_MODE !== 'owned' || origin !== 'https://prmqgcrnpuvpzruyzvuv.supabase.co') {
    throw new Error('QA runtime is forbidden outside isolated Xtimator development')
  }
  return true
}

/** Undefined preserves ordinary configuration; QA never reads a real provider key. */
export function qaIntegrationKey(provider: string, env: NodeJS.ProcessEnv = process.env): string | null | undefined {
  if (!isQaDevelopmentRuntime(env)) return undefined
  return provider === 'openrouter' ? 'qa-synthetic-never-a-real-key' : null
}

/** Production builds may use fixture content only inside the isolated CI runtime. */
export function academyFixturesEnabledForRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ACADEMY_FIXTURES === '1' && (env.NODE_ENV !== 'production' || isQaDevelopmentRuntime(env))
}
