import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startProviders } from './providers.mjs'

const devHost = 'prmqgcrnpuvpzruyzvuv.supabase.co'
if (process.env.XTIMATOR_QA_DEV !== '1' || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid').origin !== `https://${devHost}`) {
  throw new Error('Explicit Xtimator development QA configuration required')
}
for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'XTIMATOR_DATA_JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing QA prerequisite: ${key}`)
}
mkdirSync('qa-results', { recursive: true })
const systemEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'CI'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
const env = { ...systemEnv }
// Next loads dotenv files itself. Explicit empty values prevent an excluded
// production/provider credential from being reintroduced by a local file.
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (!existsSync(file)) continue
  for (const match of readFileSync(file, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = ''
}
Object.assign(env, {
  NODE_ENV: 'development', XTIMATOR_QA_DEV: '1', DATA_API_MODE: 'supabase', NEXT_PUBLIC_AUTH_MODE: 'owned',
  NEXT_PUBLIC_SUPABASE_URL: `https://${devHost}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  XTIMATOR_DATA_JWT_SECRET: process.env.XTIMATOR_DATA_JWT_SECRET,
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:9650', APP_ORIGIN: 'http://127.0.0.1:9650',
  GOOGLE_AUTH_PROJECT_ID: 'skaleclub', FIREBASE_API_KEY: 'qa-no-external-auth', FIREBASE_AUTH_DOMAIN: 'qa.invalid',
  OPENROUTER_API_KEY: 'qa-synthetic-never-a-real-key', STORAGE_PROVIDER: 'supabase',
  ACADEMY_FIXTURES: '1',
  INNGEST_DEV: '1', INNGEST_BASE_URL: 'http://127.0.0.1:8288',
  NEXT_TELEMETRY_DISABLED: '1', QA_NETWORK_LOG: resolve('qa-results/network.jsonl'),
  NODE_OPTIONS: `--max-old-space-size=3072 --require ${JSON.stringify(resolve('scripts/qa/network-guard.cjs'))}`,
})
const providers = await startProviders()
const children = [
  spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '9650'], { env, stdio: 'inherit' }),
  spawn(process.platform === 'win32' ? process.execPath : resolve('node_modules/.bin/inngest-cli'),
    [...(process.platform === 'win32' ? ['node_modules/inngest-cli/bin/inngest'] : []), 'dev', '--no-discovery', '-u', 'http://127.0.0.1:9650/api/inngest'],
    { env: { ...systemEnv, INNGEST_DEV: '1', DO_NOT_TRACK: '1' }, stdio: 'inherit' }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  providers.close()
  process.exitCode = code
}
for (const child of children) {
  child.on('error', () => stop(1))
  child.on('exit', code => { if (!stopping) stop(code || 1) })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop())
