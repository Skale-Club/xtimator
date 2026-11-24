import test from 'node:test'
import assert from 'node:assert/strict'
import { isQaDevelopmentRuntime, qaIntegrationKey } from '../../lib/qa/runtime.ts'

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
