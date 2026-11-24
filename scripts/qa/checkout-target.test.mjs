import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkoutTarget } from './checkout-target.mjs'

const sessionId = 'cs_test_synthetic'
const encode = (url, id = sessionId) => JSON.stringify({ sessionId: id, checkoutUrl: url })
test('accepts an SDK-returned Stripe URL bound to the exact verified TEST session', () => {
  for (const prefix of ['/c/pay/', '/sandbox/pay/', '/pay/']) {
    const url = `https://checkout.stripe.com${prefix}${sessionId}#private-fragment`
    assert.equal(checkoutTarget(encode(url)), url)
  }
})
test('rejects live or different session tokens even on the official Stripe host', () => {
  for (const token of ['cs_live_synthetic', 'cs_test_other', `${sessionId}extra`]) {
    assert.throws(() => checkoutTarget(encode(`https://checkout.stripe.com/c/pay/${token}`)), /Invalid Checkout target/)
  }
  assert.throws(() => checkoutTarget(encode('https://checkout.stripe.com/c/pay/cs_live_synthetic', 'cs_live_synthetic')))
})
test('rejects credentials, impersonated hosts, plaintext and extra path components', () => {
  for (const url of [
    `https://checkout.stripe.com.example.invalid/c/pay/${sessionId}`,
    `https://checkout.stripe.com@example.invalid/c/pay/${sessionId}`,
    `https://user@checkout.stripe.com/c/pay/${sessionId}`,
    `http://checkout.stripe.com/c/pay/${sessionId}`,
    `https://checkout.stripe.com/c/pay/extra/${sessionId}`,
    `https://checkout.stripe.com/c/pay/${sessionId}/extra`,
  ]) assert.throws(() => checkoutTarget(encode(url)))
})
test('rejects empty, malformed and oversized private input without echoing it', () => {
  for (const input of ['', '{}', 'not-json', 'x'.repeat(8193)]) {
    assert.throws(() => checkoutTarget(input), { message: 'Invalid Checkout target' })
  }
})
