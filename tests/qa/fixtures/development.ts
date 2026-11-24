const DEVELOPMENT_ORIGIN = 'https://prmqgcrnpuvpzruyzvuv.supabase.co'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
export const QA_APP_ORIGIN = 'https://127.0.0.1:9650'

function parseUrl(value: string | undefined, label: string) {
  try {
    if (value) return new URL(value)
  } catch {
    // Do not include configuration values in errors.
  }
  throw new Error(`QA needs a valid ${label}`)
}

function isOriginUrl(url: URL) {
  return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
}

export function requireQaDevelopment(baseURL: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.XTIMATOR_QA_DEV !== '1' || env.DATA_API_MODE !== 'supabase' || env.NEXT_PUBLIC_AUTH_MODE !== 'owned') {
    throw new Error('QA fixtures need XTIMATOR_QA_DEV=1, DATA_API_MODE=supabase and NEXT_PUBLIC_AUTH_MODE=owned')
  }

  const localApp = parseUrl(baseURL, 'loopback app URL')
  if (!LOOPBACK_HOSTS.has(localApp.hostname) || !['http:', 'https:'].includes(localApp.protocol) || !isOriginUrl(localApp)) {
    throw new Error('QA fixtures require a loopback app origin')
  }

  const publicData = parseUrl(env.NEXT_PUBLIC_SUPABASE_URL, 'Supabase development URL')
  const upstream = parseUrl(env.DATA_API_UPSTREAM_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, 'Supabase development upstream')
  if ([publicData, upstream].some(url => url.origin !== DEVELOPMENT_ORIGIN || !isOriginUrl(url))) {
    throw new Error('QA fixtures require the Xtimator Supabase development origin')
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey?.trim()) throw new Error('QA fixtures need the Supabase development service role key')

  return { localApp, serviceKey, supabaseOrigin: DEVELOPMENT_ORIGIN }
}
