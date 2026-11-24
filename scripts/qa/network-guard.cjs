/* Loaded only by the isolated QA runner, never by the application bundle. */
const net = require('node:net')
const { appendFileSync } = require('node:fs')

const DEV_HOST = 'prmqgcrnpuvpzruyzvuv.supabase.co'
if (process.env.XTIMATOR_QA_DEV !== '1' || process.env.DATA_API_MODE !== 'supabase' ||
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid').origin !== `https://${DEV_HOST}`) {
  throw new Error('QA network guard requires the explicitly identified development database')
}

function audit(kind, host) {
  if (process.env.QA_NETWORK_LOG) appendFileSync(process.env.QA_NETWORK_LOG, JSON.stringify({ kind, host }) + '\n')
}
function destination(args) {
  let first = args[0]
  if (Array.isArray(first)) first = first[0]
  if (typeof first === 'object' && first !== null) {
    if (first.path && !first.port) return { localPipe: true }
    return { host: first.host || first.hostname || 'localhost', port: Number(first.port) }
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { localPipe: true }
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(first) }
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const target = destination(args)
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.host)
  if (!target.localPipe && !loopback && !(target.host === DEV_HOST && target.port === 443)) {
    audit('blocked-tcp', String(target.host))
    throw new Error('QA_EGRESS_DENIED: non-development network destination')
  }
  return connect.apply(this, args)
}

// Keep production provider code intact; replace only its transport with a local
// deterministic fixture. The TCP guard still denies every real provider socket.
const fetch = globalThis.fetch
globalThis.fetch = async function (input, init) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (url.origin === 'https://openrouter.ai' && url.pathname.startsWith('/api/v1/')) {
    const headers = new Headers(request.headers)
    headers.delete('authorization')
    headers.delete('cookie')
    const target = new URL(url.pathname.replace('/api/v1/', '/openrouter/'), 'http://127.0.0.1:9651')
    audit('simulated-provider', 'openrouter.ai')
    return fetch(new Request(target, { method: request.method, headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      duplex: 'half', signal: request.signal }))
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!local && !(url.origin === `https://${DEV_HOST}`)) {
    audit('blocked-fetch', url.hostname)
    throw new Error('QA_EGRESS_DENIED: non-development fetch destination')
  }
  // Never follow a permitted development response into an unreviewed host.
  return fetch(new Request(request, { redirect: 'error' }))
}
