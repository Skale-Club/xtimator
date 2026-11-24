import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:https'

const LOOPBACK = '127.0.0.1'
const HOP_HEADERS = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]

function loopbackOrigin(value, protocol) {
  const url = URL.parse(value)
  if (!url || url.protocol !== protocol || url.hostname !== LOOPBACK || !url.port || value !== url.origin) {
    throw new Error('QA HTTPS front requires explicit loopback origins and ports')
  }
  return url
}

function endToEndHeaders(headers) {
  const removed = new Set(HOP_HEADERS)
  for (const token of (headers.connection ?? '').split(',')) removed.add(token.trim().toLowerCase())
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !removed.has(key)))
}

export async function startHttpsFront({ tls, publicOrigin, upstreamOrigin }) {
  const front = loopbackOrigin(publicOrigin, 'https:')
  const upstream = loopbackOrigin(upstreamOrigin, 'http:')
  const server = createServer({
    key: readFileSync(tls.keyPath),
    cert: readFileSync(tls.certificatePath),
  }, (incoming, outgoing) => {
    const target = incoming.url ?? ''
    if (incoming.headersDistinct.host?.length !== 1 || incoming.headers.host !== front.host
      || !target.startsWith('/') || target.startsWith('//') || /[\\#]/.test(target)) {
      outgoing.writeHead(400, { connection: 'close' }).end()
      return
    }

    const headers = endToEndHeaders(incoming.headers)
    for (const key of Object.keys(headers)) {
      if (key === 'forwarded' || key.startsWith('x-forwarded-')) delete headers[key]
    }
    headers.host = front.host
    headers['x-forwarded-host'] = front.host
    headers['x-forwarded-proto'] = 'https'
    headers['x-forwarded-port'] = front.port

    const request = httpRequest({
      hostname: upstream.hostname,
      port: upstream.port,
      path: target,
      method: incoming.method,
      headers,
      agent: false,
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, endToEndHeaders(response.headers))
      response.on('error', () => outgoing.destroy())
      response.pipe(outgoing)
    })
    request.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy()
      else outgoing.writeHead(502, { connection: 'close' }).end()
    })
    outgoing.on('close', () => {
      if (!outgoing.writableFinished) request.destroy()
    })
    incoming.on('error', () => request.destroy())
    outgoing.on('error', () => request.destroy())
    incoming.pipe(request)
  })

  await new Promise((resolve, reject) => {
    const onListenError = () => reject(new Error('QA HTTPS front could not listen on loopback'))
    server.once('error', onListenError)
    server.listen(Number(front.port), LOOPBACK, () => {
      server.off('error', onListenError)
      resolve()
    })
  })
  let closed
  return {
    close() {
      closed ??= new Promise(resolve => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
      return closed
    },
  }
}
