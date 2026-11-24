import test from 'node:test'
import assert from 'node:assert/strict'
import { startProviders, ESTIMATE, TRANSCRIPT } from './providers.mjs'

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
