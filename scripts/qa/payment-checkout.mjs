import { createServer } from 'node:http'
import { connect } from 'node:net'

const checkoutOrigin = 'https://checkout.stripe.com'
const successUrl = 'https://example.com/?xtimator_sandbox_complete=1'
const stripeHosts = new Set(['stripe.com', 'stripe.network'])
const challengePattern = /hcaptcha|recaptcha|captcha|arkoselabs|turnstile/i

function isStripeHost(host) {
  return [...stripeHosts].some(domain => host === domain || host.endsWith(`.${domain}`))
}

async function readCheckout() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > 8192) throw new Error('Invalid Checkout input')
  }
  const { sessionId, checkoutUrl } = JSON.parse(input)
  const url = new URL(checkoutUrl)
  if (typeof sessionId !== 'string' || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)
    || url.origin !== checkoutOrigin || url.username || url.password
    || ![`/c/pay/${sessionId}`, `/pay/${sessionId}`].includes(url.pathname)) {
    throw new Error('Invalid Checkout target')
  }
  return url.href
}

// Chromium routing alone may miss the targets of HTTP redirects. The CONNECT
// proxy also checks each HTTPS host while leaving normal browser TLS intact.
async function startProxy(observeChallenge) {
  const sockets = new Set()
  const proxy = createServer((_request, response) => response.writeHead(403).end())
  proxy.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  })
  proxy.on('connect', (request, downstream, head) => {
    const host = /^([a-z0-9.-]+):443$/i.exec(request.url ?? '')?.[1].toLowerCase()
    if (!host || (!isStripeHost(host) && host !== 'example.com')) {
      if (host && challengePattern.test(host)) observeChallenge()
      downstream.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const upstream = connect(443, host, () => {
      downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      downstream.pipe(upstream).pipe(downstream)
    })
    upstream.setTimeout(25_000, () => upstream.destroy())
    upstream.on('error', () => downstream.destroy())
    upstream.on('close', () => downstream.destroy())
    downstream.on('close', () => upstream.destroy())
  })
  await new Promise((resolve, reject) => {
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${proxy.address().port}`,
    close() {
      for (const socket of sockets) socket.destroy()
      return new Promise(resolve => proxy.close(resolve))
    },
  }
}

let browser
let proxy
let challengeRequested = false
let page

async function visibleChallenge() {
  if (!page) return challengeRequested
  try {
    return await page.locator('iframe[src*="captcha" i], iframe[title*="challenge" i], [role="alert"]')
      .evaluateAll(elements => elements.some(element => element.getBoundingClientRect().height > 1
        && /captcha|verify (?:that )?you(?: are|'re) human|security challenge/i.test(
          `${element.getAttribute('src')} ${element.getAttribute('title')} ${element.textContent}`,
        ))) || challengeRequested
  } catch {
    return challengeRequested
  }
}

async function fillOptional(selector, value) {
  const control = page.locator(selector)
  if (await control.isVisible()) await control.fill(value)
}

// All values below are synthetic. Use the card in the real hosted UI per
// https://docs.stripe.com/testing#test-code, never in a Stripe API call.
async function checkout() {
  const url = await readCheckout()
  const { chromium } = await import('@playwright/test')
  proxy = await startProxy(() => { challengeRequested = true })
  browser = await chromium.launch({
    headless: true,
    timeout: 12_000,
    proxy: { server: proxy.url },
    args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--proxy-bypass-list=<-loopback>'],
  })
  const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' })
  await context.route('**/*', async route => {
    const request = route.request()
    const target = new URL(request.url())
    const allowed = !target.username && !target.password && !target.port && target.protocol === 'https:'
      && (isStripeHost(target.hostname) || (target.href === successUrl && request.method() === 'GET'))
    if (!allowed && challengePattern.test(target.hostname)) challengeRequested = true
    await (allowed ? route.continue() : route.abort())
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  page = await context.newPage()
  page.setDefaultTimeout(8_000)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  if (new URL(page.url()).origin !== checkoutOrigin) throw new Error('Checkout navigation failed')

  const cardNumber = page.locator('#cardNumber, input[autocomplete="cc-number"]')
  if (!await cardNumber.isVisible()) {
    const card = page.getByRole('button', { name: 'Card', exact: true })
      .or(page.getByRole('radio', { name: 'Card', exact: true }))
    const initialControl = cardNumber.or(card)
    await initialControl.first().waitFor({ state: 'visible' })
    if (!await cardNumber.isVisible()) await card.click()
  }
  await cardNumber.fill('4242424242424242')
  await page.locator('#cardExpiry, input[autocomplete="cc-exp"]').fill('1234')
  await page.locator('#cardCvc, input[autocomplete="cc-csc"]').fill('123')
  await fillOptional('#billingName, input[autocomplete="cc-name"]', 'Xtimator Sandbox')
  await fillOptional('#billingPostalCode, input[autocomplete="postal-code"]', '10001')

  await page.getByRole('button', { name: /^(?:Subscribe|Start subscription)(?:\b|$)/i }).click()
  await page.waitForURL(successUrl, { waitUntil: 'commit', timeout: 30_000 })
}

async function close() {
  await proxy?.close()
  await browser?.close()
}

// Exit codes are the only information returned to the test runner. Never emit
// a Playwright error, page URL, provider response or checkout artifact.
const watchdog = setTimeout(() => process.kill(process.pid, 'SIGTERM'), 110_000)
process.once('SIGTERM', async () => {
  const forceExit = setTimeout(() => process.exit(4), 5_000)
  await close().catch(() => {})
  clearTimeout(forceExit)
  process.exit(4)
})

try {
  await checkout()
} catch {
  process.exitCode = await visibleChallenge() ? 3 : 2
} finally {
  await close().catch(() => { process.exitCode ||= 2 })
  clearTimeout(watchdog)
}
