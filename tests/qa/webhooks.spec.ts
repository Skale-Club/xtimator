import { randomUUID } from 'node:crypto'
import { test, expect } from './test'
import { requireQaDevelopment } from './fixtures/development'

test('[QA:WEBHOOK-REJECTION] unsigned and forged public callbacks fail closed before parsing business payloads', async ({ request, baseURL }, info) => {
  requireQaDevelopment(baseURL!)
  const forged = randomUUID()
  const endpoints = [
    { path: '/api/webhooks/stripe', header: 'stripe-signature', signature: `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
    { path: '/api/webhooks/whatsapp', header: 'x-hub-signature-256', signature: `sha256=${'0'.repeat(64)}` },
    { path: '/api/webhooks/twilio', header: 'x-twilio-signature', signature: forged },
    { path: '/api/blog/telegram/webhook', header: 'x-telegram-bot-api-secret-token', signature: forged },
  ]
  const evidence: Array<{ path: string; case: string; status: number }> = []
  for (const endpoint of endpoints) {
    for (const variant of ['missing-signature', 'forged-signature', 'malformed-unsigned-body']) {
      await test.step(`${endpoint.path}: ${variant}`, async () => {
        const response = await request.post(endpoint.path, {
          headers: { 'content-type': 'application/json', ...(variant === 'forged-signature' ? { [endpoint.header]: endpoint.signature } : {}) },
          // No customer identifiers, event IDs, payment objects or messages.
          data: variant === 'malformed-unsigned-body' ? '{' : '{}',
        })
        evidence.push({ path: endpoint.path, case: variant, status: response.status() })
        expect.soft([400, 401], `${endpoint.path} must reject ${variant}`).toContain(response.status())
        const body = await response.text()
        expect.soft(body.length, 'Authentication errors must stay generic').toBeLessThan(250)
        expect.soft(body).not.toMatch(/stack|service_role|webhook_secret|authToken|-----BEGIN/i)
      })
    }
  }
  const handshake = await request.get('/api/webhooks/whatsapp', { params: {
    'hub.mode': 'subscribe', 'hub.verify_token': forged, 'hub.challenge': 'qa-untrusted-challenge',
  } })
  expect(handshake.status()).toBe(403)
  expect(await handshake.text()).not.toContain('qa-untrusted-challenge')
  await info.attach('webhook-rejection.json', { body: JSON.stringify({ evidence,
    whatsappHandshakeStatus: handshake.status(), validProviderCallbacksVerified: false }, null, 2), contentType: 'application/json' })
})
