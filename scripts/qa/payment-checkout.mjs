import { createServer } from 'node:http'
import { connect } from 'node:net'
import { checkoutTarget } from './checkout-target.mjs'

const checkoutOrigin = 'https://checkout.stripe.com'
const successUrl = 'https://example.com/?xtimator_sandbox_complete=1'
const stripeHosts = new Set(['stripe.com', 'stripe.network'])
// Exact static asset hosts requested by the verified Stripe-hosted Checkout.
const stripeAssetHosts = new Set(['b.stripecdn.com', 'stripe-camo.global.ssl.fastly.net', 'pay.google.com', 'applepay.cdn-apple.com'])
const challengePattern = /hcaptcha|recaptcha|captcha|arkoselabs|turnstile/i
const blockedHosts = new Set()

function isStripeHost(host) {
  return stripeAssetHosts.has(host) || host === 'hcaptcha.com' || host.endsWith('.hcaptcha.com')
    || [...stripeHosts].some(domain => host === domain || host.endsWith(`.${domain}`))
}

async function readCheckout() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (input.length > 8192) throw new Error('Invalid Checkout input')
  }
  return checkoutTarget(input)
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
      if (host) blockedHosts.add(host)
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
let phase = 'input'
const failureCodes = { input: 10, module: 11, proxy: 12, browser: 13, navigation: 14, card: 15, submit: 16, redirect: 17 }

async function visibleChallenge() {
  if (!page) return false
  try {
    return await page.locator('iframe[src*="captcha" i], iframe[title*="challenge" i], [role="alert"]')
      .evaluateAll(elements => elements.some(element => {
        const rect = element.getBoundingClientRect()
        if (rect.width <= 1 || rect.height <= 1 || rect.bottom <= 0 || rect.top >= innerHeight) return false
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
        }
        return /captcha|verify (?:that )?you(?: are|'re) human|security challenge/i.test(
          `${element.getAttribute('src')} ${element.getAttribute('title')} ${element.textContent}`,
        )
      }))
  } catch {
    return false
  }
}

async function fillOptional(selector, value) {
  for (const frame of page.frames()) {
    const control = frame.locator(selector)
    if (await control.count() === 1 && await control.isVisible()) {
      await control.fill(value)
      return
    }
  }
}

async function cardControl(selector) {
  const deadline = Date.now() + 15_000
  let cardChosen = false
  do {
    for (const frame of page.frames()) {
      const control = frame.locator(selector)
      if (await control.count() === 1 && await control.isVisible()) return control
      if (!cardChosen) {
        const card = frame.getByRole('button', { name: 'Card', exact: true })
          .or(frame.getByRole('radio', { name: 'Card', exact: true }))
        if (await card.count() === 1 && await card.isVisible()) {
          await card.click()
          cardChosen = true
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  } while (Date.now() < deadline)
  throw new Error('Required card control unavailable')
}

async function submitSubscription() {
  const deadline = Date.now() + 15_000
  do {
    for (const frame of page.frames()) {
      const button = frame.getByRole('button', { name: /^(?:Subscribe|Start subscription)(?:\b|$)/i })
      if (await button.count() === 1 && await button.isVisible()) {
        await button.click()
        return
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  } while (Date.now() < deadline)
  throw new Error('Subscription confirmation unavailable')
}

// All values below are synthetic. Use the card in the real hosted UI per
// https://docs.stripe.com/testing#test-code, never in a Stripe API call.
async function checkout() {
  const url = await readCheckout()
  phase = 'module'
  const { chromium } = await import('@playwright/test')
  phase = 'proxy'
  proxy = await startProxy(() => { challengeRequested = true })
  phase = 'browser'
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
    if (!allowed) blockedHosts.add(target.hostname)
    if (!allowed && challengePattern.test(target.hostname)) challengeRequested = true
    await (allowed ? route.continue() : route.abort())
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  page = await context.newPage()
  page.setDefaultTimeout(8_000)
  phase = 'navigation'
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  if (new URL(page.url()).origin !== checkoutOrigin) throw new Error('Checkout navigation failed')

  phase = 'card'
  const cardNumber = await cardControl('#cardNumber, input[autocomplete="cc-number"], input[name="cardnumber"], input[name="number"]')
  await cardNumber.fill('4242424242424242')
  await (await cardControl('#cardExpiry, input[autocomplete="cc-exp"], input[name="exp-date"], input[name="expiry"]')).fill('1234')
  await (await cardControl('#cardCvc, input[autocomplete="cc-csc"], input[name="cvc"]')).fill('123')
  await fillOptional('#billingName, input[autocomplete="cc-name"]', 'Xtimator Sandbox')
  await fillOptional('#billingPostalCode, input[autocomplete="postal-code"]', '10001')

  phase = 'submit'
  await submitSubscription()
  phase = 'redirect'
  await page.waitForURL(successUrl, { waitUntil: 'commit', timeout: 30_000 })
}

async function close() {
  await proxy?.close()
  await browser?.close()
}

// Return only fixed exit codes and structural diagnostics. Never emit a
// Playwright error, page URL, provider response or checkout artifact.
const watchdog = setTimeout(() => process.kill(process.pid, 'SIGTERM'), 110_000)
process.once('SIGTERM', async () => {
  const forceExit = setTimeout(() => process.exit(4), 5_000)
  await close().catch(() => {})
  clearTimeout(forceExit)
  process.exit(4)
})

try {
  await checkout()
} catch (error) {
  process.exitCode = await visibleChallenge() ? 3 : failureCodes[phase]
  const frames = []
  for (const frame of page?.frames().slice(0, 24) ?? []) {
    frames.push({
      cardFields: await frame.locator('#cardNumber, input[autocomplete="cc-number"]').count().catch(() => -1),
      emailFields: await frame.locator('input[type="email"]').count().catch(() => -1),
      inputs: await frame.locator('input').count().catch(() => -1),
    })
  }
  process.stdout.write(JSON.stringify({
    timeout: error?.name === 'TimeoutError',
    blockedChallengeResource: challengeRequested,
    frameCount: page?.frames().length ?? 0,
    strictSelector: typeof error?.message === 'string' && error.message.includes('strict mode violation'),
    frames, blockedHosts: [...blockedHosts].slice(0, 12),
  }))
} finally {
  await close().catch(() => { process.exitCode ||= 2 })
  clearTimeout(watchdog)
}
