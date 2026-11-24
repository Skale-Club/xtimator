import test from 'node:test'
import assert from 'node:assert/strict'
import { startProviders, ESTIMATE, TRANSCRIPT } from './providers.mjs'
import { randomUUID } from 'node:crypto'

test('synthetic provider exercises actual HTTP and preserves tool JSON across SSE frames', async () => {
  const server = await startProviders(0)
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const stream of [false, true]) {
      const response = await fetch(origin + '/openrouter/chat/completions', { method: 'POST', body: JSON.stringify({ stream, tools: [{ function: { name: 'create_estimate' } }] }) })
      assert.equal(response.status, 200)
      if (stream) {
        const events = (await response.text()).split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
        assert.deepEqual(JSON.parse(events[0].choices[0].delta.tool_calls[0].function.arguments), ESTIMATE)
        assert.equal(events.at(-1).choices[0].finish_reason, 'tool_calls')
      } else assert.deepEqual(JSON.parse((await response.json()).choices[0].message.tool_calls[0].function.arguments), ESTIMATE)
    }
    const audio = await fetch(origin + '/openrouter/audio/transcriptions', { method: 'POST', body: 'synthetic audio' })
    assert.equal((await audio.json()).text, TRANSCRIPT)
    await fetch(origin + '/fail-next', { method: 'POST' })
    assert.equal((await fetch(origin + '/openrouter/chat/completions', { method: 'POST', body: '{}' })).status, 503)
    assert.equal((await fetch(origin + '/openrouter/chat/completions', { method: 'POST', body: JSON.stringify({ tools: [{ function: { name: 'unknown' } }] }) })).status, 422)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('provider faults are bounded and cannot fail an unrelated synthetic project', async () => {
  const server = await startProviders(0)
  const origin = `http://127.0.0.1:${server.address().port}`
  const scope = `qa-${randomUUID()} Project`
  const request = async text => fetch(origin + '/openrouter/chat/completions', {
    method: 'POST', body: JSON.stringify({ messages: [{ content: text }], tools: [{ function: { name: 'create_estimate' } }] }),
  })
  try {
    assert.equal((await fetch(origin + '/fault', { method: 'POST', body: JSON.stringify({ scope, attempts: 4 }) })).status, 400)
    assert.equal((await fetch(origin + '/fault', { method: 'POST', body: JSON.stringify({ scope: 'real customer', attempts: 1 }) })).status, 400)
    assert.equal((await fetch(origin + '/fault', { method: 'POST', body: JSON.stringify({ scope, attempts: 3 }) })).status, 200)
    assert.equal((await request('an unrelated project')).status, 200)
    for (let count = 0; count < 3; count++) assert.equal((await request(scope)).status, 503)
    assert.equal((await request(scope)).status, 200)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('the isolated admin catalog returns structured models without contacting a provider', async () => {
  const server = await startProviders(0)
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const response = await fetch(`${origin}/openrouter/models`)
    assert.equal(response.status, 200)
    const catalog = await response.json()
    assert.equal(catalog.data[0].id, 'anthropic/claude-sonnet-5')
    assert.match(catalog.data[0].name, /^QA synthetic /)
    assert.deepEqual(catalog.data[0].pricing, { prompt: '0', completion: '0' })
    assert.deepEqual(await (await fetch(`${origin}/history`)).json(), [{ kind: 'model-catalog' }])
    assert.equal((await fetch(`${origin}/unsupported-catalog`)).status, 404)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
