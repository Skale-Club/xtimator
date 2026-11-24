import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { QA_APP_ORIGIN, requireQaDevelopment } from '../../tests/qa/fixtures/development.ts'
import { startHttpsFront } from './https-front.mjs'
import { startProviders } from './providers.mjs'
import { readQaTls } from './tls.mjs'

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('The standalone QA runner requires GitHub Actions')
const { supabaseOrigin, serviceKey } = requireQaDevelopment(QA_APP_ORIGIN)
for (const key of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'XTIMATOR_DATA_JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing QA prerequisite: ${key}`)
}
const tls = readQaTls()
const upstream = new URL('http://127.0.0.1:9652')
mkdirSync('qa-results', { recursive: true })
const systemEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'CI'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
const env = { ...systemEnv }
// Next loads dotenv files itself. Explicit empty values prevent an excluded
// production/provider credential from being reintroduced by a local file.
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (!existsSync(file)) continue
  for (const match of readFileSync(file, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = ''
}
Object.assign(env, {
  NODE_ENV: 'production', GITHUB_ACTIONS: 'true', XTIMATOR_QA_DEV: '1', XTIMATOR_QA_PRODUCTION_BUILD: '1',
  DATA_API_MODE: 'supabase', DATA_API_UPSTREAM_URL: supabaseOrigin, NEXT_PUBLIC_AUTH_MODE: 'owned',
  NEXT_PUBLIC_SUPABASE_URL: supabaseOrigin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  SUPABASE_SECRET_KEY: serviceKey,
  XTIMATOR_DATA_JWT_SECRET: process.env.XTIMATOR_DATA_JWT_SECRET,
  NEXT_PUBLIC_SITE_URL: QA_APP_ORIGIN, APP_ORIGIN: QA_APP_ORIGIN,
  APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  NODE_EXTRA_CA_CERTS: tls.certificatePath,
  GOOGLE_AUTH_PROJECT_ID: 'skaleclub', FIREBASE_API_KEY: 'qa-no-external-auth', FIREBASE_AUTH_DOMAIN: 'qa.invalid',
  OPENROUTER_API_KEY: 'qa-synthetic-never-a-real-key', STORAGE_PROVIDER: 'supabase',
  ACADEMY_FIXTURES: '1',
  INNGEST_DEV: '1', INNGEST_BASE_URL: 'http://127.0.0.1:8288', INNGEST_SERVE_HOST: upstream.origin,
  NEXT_TELEMETRY_DISABLED: '1', QA_NETWORK_LOG: resolve('qa-results/network.jsonl'),
  NODE_OPTIONS: `--max-old-space-size=3072 --require ${JSON.stringify(resolve('scripts/qa/network-guard.cjs'))}`,
})

const shutdown = new AbortController()
const children = new Set()
let providers
let front

function stop(code = 0) {
  if (shutdown.signal.aborted) return
  shutdown.abort()
  for (const child of children) child.kill('SIGTERM')
  void front?.close()
  providers?.close()
  providers?.closeAllConnections()
  process.exitCode = code
}

function launch(binary, args, childEnv, label, { oneShot = false } = {}) {
  shutdown.signal.throwIfAborted()
  const child = spawn(binary, args, { env: childEnv, stdio: 'inherit' })
  children.add(child)
  return new Promise((complete, reject) => {
    child.once('error', () => {
      children.delete(child)
      reject(new Error(`Could not start QA ${label}`))
    })
    child.once('exit', (code, signal) => {
      children.delete(child)
      if (shutdown.signal.aborted || (oneShot && code === 0)) complete()
      else reject(new Error(`QA ${label} exited (${code ?? signal})`))
    })
  })
}

function fail(error) {
  if (!shutdown.signal.aborted) {
    console.error(error.message)
    stop(1)
  }
}

async function waitForStandalone() {
  const readyBy = Date.now() + 60_000
  while (Date.now() < readyBy) {
    shutdown.signal.throwIfAborted()
    try {
      const response = await fetch(new URL('/api/health?quick=1', upstream), {
        redirect: 'manual',
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(2_000)]),
      })
      await response.body?.cancel()
      if (response.status === 200) return
    } catch {
      // The fixed loopback port might not be listening yet.
    }
    await delay(500, undefined, { signal: shutdown.signal })
  }
  throw new Error('QA standalone health check did not return HTTP 200')
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop())

try {
  providers = await startProviders()
  shutdown.signal.throwIfAborted()
  await launch(process.execPath, ['node_modules/next/dist/bin/next', 'build'], env, 'production build', { oneShot: true })
  shutdown.signal.throwIfAborted()

  const standalone = resolve('.next/standalone/server.js')
  if (!existsSync(standalone)) throw new Error('QA requires a standalone Next.js build')
  for (const path of ['public', '.next/static']) {
    cpSync(path, resolve(dirname(standalone), path), { recursive: true, force: true })
  }

  void launch(process.execPath, [standalone], {
    ...env, HOSTNAME: upstream.hostname, PORT: upstream.port,
  }, 'standalone server').catch(fail)
  await waitForStandalone()

  void launch(process.platform === 'win32' ? process.execPath : resolve('node_modules/.bin/inngest-cli'),
    [...(process.platform === 'win32' ? ['node_modules/inngest-cli/bin/inngest'] : []), 'dev', '--no-discovery', '-u', new URL('/api/inngest', upstream).href],
    { ...systemEnv, INNGEST_DEV: '1', DO_NOT_TRACK: '1' }, 'Inngest dev server').catch(fail)

  front = await startHttpsFront({ tls, publicOrigin: QA_APP_ORIGIN, upstreamOrigin: upstream.origin })
  if (shutdown.signal.aborted) await front.close()
} catch (error) {
  fail(error)
} finally {
  // A signal can arrive while the local fixture server is still binding.
  if (shutdown.signal.aborted && providers?.listening) {
    providers.close()
    providers.closeAllConnections()
  }
}
