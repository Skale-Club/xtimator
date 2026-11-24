import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

function probe(code, extra = {}) {
  return spawnSync(process.execPath, ['--require', resolve('scripts/qa/network-guard.cjs'), '-e', code], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, XTIMATOR_QA_DEV: '1', DATA_API_MODE: 'supabase', NEXT_PUBLIC_SUPABASE_URL: 'https://prmqgcrnpuvpzruyzvuv.supabase.co', QA_NETWORK_LOG: '', ...extra },
  })
}
test('network boundary rejects production configuration before any request', () => {
  assert.notEqual(probe('', { NEXT_PUBLIC_SUPABASE_URL: 'https://xtimator.com' }).status, 0)
  assert.notEqual(probe('', { DATA_API_MODE: 'postgrest' }).status, 0)
  assert.notEqual(probe('', { XTIMATOR_QA_DEV: '' }).status, 0)
})
test('fetch, plain TCP and TLS cannot contact real provider endpoints', () => {
  const result = probe(`const a=require('node:assert/strict');const n=require('node:net');const t=require('node:tls');
    a.throws(()=>n.connect(443,'api.stripe.com'),/QA_EGRESS_DENIED/);
    a.throws(()=>n.connect({port:443,host:'1.1.1.1'}),/QA_EGRESS_DENIED/);
    a.throws(()=>t.connect({port:443,host:'api.twilio.com'}),/QA_EGRESS_DENIED/);
    a.rejects(fetch('https://api.resend.com/emails'),/QA_EGRESS_DENIED/).catch(()=>process.exitCode=1);`)
  assert.equal(result.status, 0, result.stderr)
})
test('loopback remains usable and allowed HTTP responses cannot redirect to a provider', () => {
  const result = probe(`const a=require('node:assert/strict');const s=require('node:http').createServer((q,r)=>{r.writeHead(302,{location:'https://api.stripe.com'});r.end()});
    s.listen(0,'127.0.0.1',async()=>{try {await a.rejects(fetch('http://127.0.0.1:'+s.address().port));}catch{process.exitCode=1}finally{s.close()}});`)
  assert.equal(result.status, 0, result.stderr)
})
