import test from 'node:test'
import assert from 'node:assert/strict'
import { academyFixturesEnabledForRuntime, isQaDevelopmentRuntime, qaIntegrationKey } from '../../lib/qa/runtime.ts'

const valid = { XTIMATOR_QA_DEV: '1', NODE_ENV: 'development', DATA_API_MODE: 'supabase', NEXT_PUBLIC_AUTH_MODE: 'owned', NEXT_PUBLIC_SUPABASE_URL: 'https://prmqgcrnpuvpzruyzvuv.supabase.co' }
test('ordinary production keeps its normal worker registration', () => {
  assert.equal(isQaDevelopmentRuntime({ NODE_ENV: 'production' }), false)
})
test('worker isolation is enabled only by exact development prerequisites', () => {
  assert.equal(isQaDevelopmentRuntime(valid), true)
  for (const patch of [{ NODE_ENV: 'production' }, { DATA_API_MODE: 'postgrest' }, { NEXT_PUBLIC_AUTH_MODE: 'supabase' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://xtimator.com' }, { NEXT_PUBLIC_SUPABASE_URL: '' }]) {
    assert.throws(() => isQaDevelopmentRuntime({ ...valid, ...patch }), /QA runtime/)
  }
})
test('QA never resolves real provider credentials and ordinary runtime remains unchanged', () => {
  assert.equal(qaIntegrationKey('openrouter', valid), 'qa-synthetic-never-a-real-key')
  for (const provider of ['stripe', 'stripe_test', 'resend', 'twilio', 'openai', 'notion']) assert.equal(qaIntegrationKey(provider, valid), null)
  assert.equal(qaIntegrationKey('openrouter', { NODE_ENV: 'production' }), undefined)
  assert.throws(() => qaIntegrationKey('openrouter', { ...valid, NODE_ENV: 'production' }), /QA runtime/)
})

test('a compiled campaign requires CI, its explicit flag and exact loopback browser and worker origins', () => {
  const compiled = { ...valid, NODE_ENV: 'production', XTIMATOR_QA_PRODUCTION_BUILD: '1', GITHUB_ACTIONS: 'true',
    APP_ORIGIN: 'https://127.0.0.1:9650', NEXT_PUBLIC_SITE_URL: 'https://127.0.0.1:9650',
    INNGEST_SERVE_HOST: 'http://127.0.0.1:9652' }
  assert.equal(isQaDevelopmentRuntime(compiled), true)
  assert.equal(qaIntegrationKey('openrouter', compiled), 'qa-synthetic-never-a-real-key')
  assert.equal(qaIntegrationKey('stripe', compiled), null)
  for (const patch of [
    { XTIMATOR_QA_PRODUCTION_BUILD: '' }, { GITHUB_ACTIONS: '' }, { GITHUB_ACTIONS: 'false' },
    { APP_ORIGIN: 'https://xtimator.com' }, { NEXT_PUBLIC_SITE_URL: 'https://xtimator.com' },
    { INNGEST_SERVE_HOST: 'https://xtimator.com' }, { INNGEST_SERVE_HOST: 'http://127.0.0.1:9653' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' }, { NEXT_PUBLIC_AUTH_MODE: 'supabase' },
  ]) assert.throws(() => isQaDevelopmentRuntime({ ...compiled, ...patch }), /QA runtime/)
})

test('Academy fixture content remains unavailable in ordinary production builds', () => {
  const compiled = { ...valid, NODE_ENV: 'production', XTIMATOR_QA_PRODUCTION_BUILD: '1', GITHUB_ACTIONS: 'true',
    APP_ORIGIN: 'https://127.0.0.1:9650', NEXT_PUBLIC_SITE_URL: 'https://127.0.0.1:9650',
    INNGEST_SERVE_HOST: 'http://127.0.0.1:9652', ACADEMY_FIXTURES: '1' }
  assert.equal(academyFixturesEnabledForRuntime({ NODE_ENV: 'development', ACADEMY_FIXTURES: '1' }), true)
  assert.equal(academyFixturesEnabledForRuntime({ NODE_ENV: 'production', ACADEMY_FIXTURES: '1' }), false)
  assert.equal(academyFixturesEnabledForRuntime(compiled), true)
  assert.equal(academyFixturesEnabledForRuntime({ ...compiled, ACADEMY_FIXTURES: '0' }), false)
  assert.throws(() => academyFixturesEnabledForRuntime({ ...compiled, GITHUB_ACTIONS: '' }), /QA runtime/)
  assert.throws(() => academyFixturesEnabledForRuntime({ ...compiled, NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' }), /QA runtime/)
})
