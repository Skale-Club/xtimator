/** Only the explicitly isolated development campaign may narrow worker registration. */
export function isQaDevelopmentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.XTIMATOR_QA_DEV !== '1') return false
  let origin: string
  try { origin = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin }
  catch { throw new Error('QA runtime requires an explicit development data origin') }
  if (env.NODE_ENV !== 'development' || env.DATA_API_MODE !== 'supabase' ||
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
