import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { request } from 'node:https'
import { after, before, test } from 'node:test'
import { startHttpsFront } from './https-front.mjs'
import { createQaTls, removeQaTls } from './tls.mjs'

const HOST = '127.0.0.1'
let tls

before(() => { tls = createQaTls() })
after(() => { if (tls) removeQaTls(tls.directory) })

async function listen(server) {
  server.listen(0, HOST)
  await once(server, 'listening')
  return server.address().port
}

function close(server) {
  return new Promise(resolve => {
    server.close(resolve)
    server.closeAllConnections()
  })
}

async function localOrigins(upstream) {
  const upstreamPort = await listen(upstream)
  const reservation = createServer()
  const port = await listen(reservation)
  await close(reservation)
  return {
    publicOrigin: `https://${HOST}:${port}`,
    upstreamOrigin: `http://${HOST}:${upstreamPort}`,
  }
}

function send(publicOrigin, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = request(publicOrigin, {
      ca: readFileSync(tls.certificatePath),
      // Keep the TLS identity valid while testing a rejected HTTP Host header.
      servername: 'localhost',
      agent: false,
      ...options,
    }, async response => {
      try {
        const chunks = []
        for await (const chunk of response) chunks.push(chunk)
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) })
      } catch (error) {
        reject(error)
      }
    })
    req.once('error', reject)
    req.setTimeout(5_000, () => req.destroy(new Error('QA HTTPS fixture request timed out')))
    req.end(body)
  })
}

test('streams action request bytes and download response bytes, preserving origin and cookies', async () => {
  const actionBody = Buffer.from([0, 1, 2, 10, 128, 255])
  const download = Buffer.from([137, 80, 78, 71, 0, 250])
  let seen
  const upstream = createServer(async (incoming, outgoing) => {
    const chunks = []
    for await (const chunk of incoming) chunks.push(chunk)
    seen = { method: incoming.method, path: incoming.url, headers: incoming.headers, body: Buffer.concat(chunks) }
    outgoing.writeHead(201, {
      'content-type': 'image/png',
      'content-length': download.length,
      'set-cookie': ['qa-one=a; Secure', 'qa-two=b; HttpOnly; Secure'],
      connection: 'close, x-upstream-private',
      'x-upstream-private': 'omitted',
    })
    outgoing.write(download.subarray(0, 3))
    outgoing.end(download.subarray(3))
  })
  const origins = await localOrigins(upstream)
  const host = new URL(origins.publicOrigin).host
  let front
  try {
    front = await startHttpsFront({ tls, ...origins })
    const response = await send(origins.publicOrigin, {
      method: 'POST',
      path: '/projects/action?view=editor',
      headers: {
        'content-type': 'application/octet-stream', 'content-length': actionBody.length,
        origin: origins.publicOrigin, cookie: 'qa-session=fixture', rsc: '1', 'next-action': 'mock-action-id',
        connection: 'close, x-incoming-private', 'x-incoming-private': 'omitted',
        'x-forwarded-host': 'other.invalid', 'x-forwarded-proto': 'http', 'x-forwarded-for': '192.0.2.1',
        forwarded: 'host=other.invalid',
      },
    }, actionBody)
    assert.equal(response.status, 201)
    assert.equal(response.headers['content-type'], 'image/png')
    assert.deepEqual(response.body, download)
    assert.deepEqual(response.headers['set-cookie'], ['qa-one=a; Secure', 'qa-two=b; HttpOnly; Secure'])
    assert.equal(response.headers['x-upstream-private'], undefined)
    assert.equal(seen.method, 'POST')
    assert.equal(seen.path, '/projects/action?view=editor')
    assert.deepEqual(seen.body, actionBody)
    assert.equal(seen.headers.host, host)
    assert.equal(seen.headers['x-forwarded-host'], host)
    assert.equal(seen.headers['x-forwarded-proto'], 'https')
    assert.equal(seen.headers['x-forwarded-port'], new URL(origins.publicOrigin).port)
    assert.equal(seen.headers.origin, origins.publicOrigin)
    assert.equal(seen.headers.cookie, 'qa-session=fixture')
    assert.equal(seen.headers.rsc, '1')
    assert.equal(seen.headers['next-action'], 'mock-action-id')
    for (const key of ['x-incoming-private', 'x-forwarded-for', 'forwarded']) {
      assert.equal(seen.headers[key], undefined)
    }
  } finally {
    await front?.close()
    await close(upstream)
  }
})

test('rejects mismatching hosts and absolute or network-path targets before contacting upstream', async () => {
  let hits = 0
  const upstream = createServer((_, response) => { hits++; response.end() })
  const origins = await localOrigins(upstream)
  let front
  try {
    front = await startHttpsFront({ tls, ...origins })
    for (const options of [
      { headers: { host: 'other.invalid' } },
      { path: `${origins.publicOrigin}/absolute` },
      { path: '//other.invalid/network-path' },
    ]) {
      assert.equal((await send(origins.publicOrigin, options)).status, 400)
    }
    assert.equal(hits, 0)
  } finally {
    await front?.close()
    await close(upstream)
  }
})

test('rejects prohibited origins before reading certificate files', async () => {
  const valid = { publicOrigin: 'https://127.0.0.1:9650', upstreamOrigin: 'http://127.0.0.1:9652' }
  for (const invalid of [
    { publicOrigin: 'http://127.0.0.1:9650' },
    { publicOrigin: 'https://0.0.0.0:9650' },
    { upstreamOrigin: 'http://example.invalid:9652' },
    { upstreamOrigin: 'http://127.0.0.1:9652/api/health' },
  ]) {
    await assert.rejects(startHttpsFront({ ...valid, ...invalid }), /requires explicit loopback origins/)
  }
})

test('reports unavailable upstream with a generic response and releases its listener on shutdown', async () => {
  const upstream = createServer()
  const origins = await localOrigins(upstream)
  await close(upstream)
  const front = await startHttpsFront({ tls, ...origins })
  try {
    const response = await send(origins.publicOrigin)
    assert.equal(response.status, 502)
    assert.equal(response.body.length, 0)
  } finally {
    await front.close()
  }
  await front.close()
  await assert.rejects(send(origins.publicOrigin), { code: 'ECONNREFUSED' })
})
