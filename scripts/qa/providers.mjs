import { createServer } from 'node:http'

export const TRANSCRIPT = 'Install 20 linear feet of cedar fence, including two posts and cleanup. Labor is 400 dollars and materials are 600 dollars.'
export const ESTIMATE = {
  suggested_project_name: 'QA cedar fence installation', detected_trade: 'landscaping',
  summary: 'Install 20 linear feet of cedar fence with two posts and job-site cleanup.',
  notes: 'Synthetic QA provider output. No market-price or live-AI quality claim.',
  timeline: 'One working day', payment_terms: 'Payment due on completion.',
  assumptions: ['Level and accessible ground'], exclusions: ['Permit fees'], open_questions: [], scope_confidence: 'high',
  sections: [
    { title: 'Fence materials', items: [{ description: 'Cedar fence boards and two posts', quantity: 20, unit: 'lf', unit_price: 30, price_source: 'ai_estimate', taxable: false }] },
    { title: 'Installation and cleanup', items: [{ description: 'Install fence and remove debris', quantity: 1, unit: 'job', unit_price: 400, price_source: 'ai_estimate', taxable: false }] },
  ],
}

export function startProviders(port = 9651) {
  const history = []
  let failures = 0
  const server = createServer(async (request, response) => {
    const json = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.url === '/health') return json(200, { mode: 'synthetic', realProviderCalls: 0 })
    if (request.url === '/history') return json(200, history)
    if (request.url === '/fail-next' && request.method === 'POST') { failures = 1; return json(200, { configured: true }) }
    if (failures > 0) { failures--; return json(503, { error: { message: 'Controlled QA provider outage' } }) }
    if (request.url === '/openrouter/audio/transcriptions') {
      for await (const _chunk of request) { /* consume synthetic audio without saving it */ }
      history.push({ kind: 'transcription' })
      return json(200, { text: TRANSCRIPT, usage: { seconds: 3 } })
    }
    if (request.url !== '/openrouter/chat/completions') return json(404, { error: 'Unknown synthetic provider operation' })
    let body
    try { const chunks = []; for await (const chunk of request) chunks.push(chunk); body = JSON.parse(Buffer.concat(chunks).toString()) }
    catch { return json(400, { error: 'Invalid synthetic request' }) }
    const names = body.tools?.map(tool => tool.function?.name) ?? []
    const name = names.includes('create_estimate') ? 'create_estimate' : names[0]
    history.push({ kind: 'chat', tool: name ?? null, streamed: body.stream === true })
    let output
    if (name === 'create_estimate') output = ESTIMATE
    else if (name === 'extract_photo') output = { overall_description: 'Cedar fence location on level ground', materials: [], dimensions: [], damage: [], trade_signals: ['landscaping'], access_notes: 'Level and accessible ground' }
    else if (!name) {
      const image = body.messages?.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url'))
      return json(200, { id: 'qa-synthetic', choices: [{ message: { role: 'assistant', content: image ? 'Cedar fence location on level ground' : JSON.stringify({ needs_details: false, questions: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })
    } else return json(422, { error: `Unimplemented synthetic tool: ${name}` })
    const tool = { id: 'qa-tool', type: 'function', function: { name, arguments: JSON.stringify(output) } }
    const usage = { prompt_tokens: 10, completion_tokens: 10, cost: 0 }
    if (!body.stream) return json(200, { id: 'qa-synthetic', choices: [{ message: { role: 'assistant', content: null, tool_calls: [tool] }, finish_reason: 'tool_calls' }], usage })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(`data: ${JSON.stringify({ id: 'qa-synthetic', choices: [{ delta: { tool_calls: [{ index: 0, ...tool }] }, finish_reason: null }] })}\n\n`)
    response.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage })}\n\ndata: [DONE]\n\n`)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
