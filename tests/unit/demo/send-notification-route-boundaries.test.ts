import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(start, `${name} must remain an exported route handler`).toBeGreaterThan(-1)

  const openingBrace = source.indexOf('{', source.indexOf(')', start))
  expect(openingBrace, `${name} must have a body`).toBeGreaterThan(-1)

  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }

  throw new Error(`Could not isolate ${name}`)
}

function expectGuardBefore(
  body: string,
  guard: RegExp,
  effect: RegExp,
  route: string,
) {
  const guardIndex = body.search(guard)
  const effectIndex = body.search(effect)

  expect(guardIndex, `${route} must use demoGuardResponse`).toBeGreaterThan(-1)
  expect(effectIndex, `${route} must contain the protected effect`).toBeGreaterThan(-1)
  expect(guardIndex, `${route} must deny demo context before the effect`).toBeLessThan(effectIndex)
}

const ambientGuard = /demoGuardResponse\s*\(\s*\)/
const targetGuard = /demoGuardResponse\s*\(\s*\{\s*companyId:\s*(?:estimate|company)\.company_id|company\.id\s*\}\s*\)/

describe('SAFE-01/SAFE-02: send and notification routes deny demo contexts before effects', () => {
  it('denies a demo actor and a demo estimate target before email provider or persistence work', () => {
    const body = functionBody(routeSource('app/api/estimates/[id]/send/route.ts'), 'POST')

    expectGuardBefore(body, ambientGuard, /rateLimit\s*\(/, 'email send')
    expectGuardBefore(body, targetGuard, /getIntegrationKey\s*\(/, 'email send target')
    expectGuardBefore(body, targetGuard, /requireServiceClient\s*\(/, 'email send target')
    expectGuardBefore(body, targetGuard, /sendCustomerMessage\s*\(/, 'email send target')
  })

  it('denies a demo actor and a demo estimate target before SMS provider or persistence work', () => {
    const body = functionBody(routeSource('app/api/estimates/[id]/send-sms/route.ts'), 'POST')

    expectGuardBefore(body, ambientGuard, /rateLimit\s*\(/, 'SMS send')
    expectGuardBefore(body, targetGuard, /requireServiceClient\s*\(/, 'SMS send target')
    expectGuardBefore(body, targetGuard, /getTwilioCustomerMessagingConfig\s*\(/, 'SMS send target')
    expectGuardBefore(body, targetGuard, /sendCustomerMessage\s*\(/, 'SMS send target')
  })

  it('denies a demo actor and a demo estimate target before WhatsApp dispatch or persistence work', () => {
    const body = functionBody(routeSource('app/api/estimates/[id]/send-whatsapp/route.ts'), 'POST')

    expectGuardBefore(body, ambientGuard, /deliverEstimateViaWhatsApp\s*\(/, 'WhatsApp send')
    expectGuardBefore(body, targetGuard, /getWhatsAppAccountStatus\s*\(/, 'WhatsApp send target')
    expectGuardBefore(body, targetGuard, /requireServiceClient\s*\(/, 'WhatsApp send target')
    expectGuardBefore(body, targetGuard, /deliverEstimateViaWhatsApp\s*\(/, 'WhatsApp send target')
  })

  it('denies demo preference updates before notification persistence', () => {
    const body = functionBody(routeSource('app/api/notifications/preferences/route.ts'), 'PATCH')

    expectGuardBefore(body, ambientGuard, /upsertUserPreferences\s*\(/, 'notification preferences')
  })

  it('denies a demo actor and demo company before marking one notification read', () => {
    const body = functionBody(routeSource('app/api/notifications/[id]/read/route.ts'), 'PATCH')

    expectGuardBefore(body, ambientGuard, /getActiveCompany\s*\(/, 'single notification read')
    expectGuardBefore(body, targetGuard, /requireServiceClient\s*\(/, 'single notification read target')
  })

  it('denies a demo actor and demo company before marking all notifications read', () => {
    const body = functionBody(routeSource('app/api/notifications/mark-all-read/route.ts'), 'POST')

    expectGuardBefore(body, ambientGuard, /getActiveCompany\s*\(/, 'all notifications read')
    expectGuardBefore(body, targetGuard, /requireServiceClient\s*\(/, 'all notifications read target')
  })

  it('denies demo push subscription writes before persistence for both methods', () => {
    const source = routeSource('app/api/notifications/push/subscribe/route.ts')

    expectGuardBefore(functionBody(source, 'POST'), ambientGuard, /upsertUserPreferences\s*\(/, 'push subscribe')
    expectGuardBefore(functionBody(source, 'DELETE'), ambientGuard, /upsertUserPreferences\s*\(/, 'push unsubscribe')
  })

  it('keeps normal 401 handling before a demo guard and preserves an available normal-tenant path', () => {
    const body = functionBody(routeSource('app/api/notifications/preferences/route.ts'), 'PATCH')
    const unauthorizedIndex = body.search(/if\s*\(\s*!claims\?\.sub\s*\)/)
    const guardIndex = body.search(ambientGuard)
    const persistenceIndex = body.search(/upsertUserPreferences\s*\(/)

    expect(unauthorizedIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeGreaterThan(unauthorizedIndex)
    expect(persistenceIndex).toBeGreaterThan(guardIndex)
  })
})
