/** The caller retrieves this URL from the verified, owned Stripe TEST session. */
export function checkoutTarget(input) {
  try {
    if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > 8192) throw Error()
    const { sessionId, checkoutUrl } = JSON.parse(input)
    if (typeof sessionId !== 'string' || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)
      || typeof checkoutUrl !== 'string') throw Error()
    const url = new URL(checkoutUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    // Stripe's returned URL can use different routing prefixes. Bind its final
    // token to the verified session instead of assuming one provider path.
    if (url.origin !== 'https://checkout.stripe.com' || url.username || url.password
      || ![2, 3].includes(parts.length) || parts.at(-1) !== sessionId
      || !parts.slice(0, -1).every(part => /^[a-z-]+$/.test(part))) throw Error()
    return url.href
  } catch {
    throw new Error('Invalid Checkout target')
  }
}
