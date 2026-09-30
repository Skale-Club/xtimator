import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { botDefenseResponse } from '@/proxy'
import { __resetBotDefense } from '@/lib/security/bot-defense'

function req(path: string, ip: string) {
  return new NextRequest(`https://xtimator.com${path}`, { headers: { 'x-forwarded-for': ip } })
}

describe('proxy bot defense', () => {
  it('404s a trap path, then 403s the scanner everywhere but the health probes', () => {
    __resetBotDefense()
    expect(botDefenseResponse(req('/', '203.0.113.200'))).toBeNull()
    expect(botDefenseResponse(req('/.env', '203.0.113.200'))?.status).toBe(404)
    const blocked = botDefenseResponse(req('/dashboard', '203.0.113.200'))
    expect(blocked?.status).toBe(403)
    expect(Number(blocked?.headers.get('retry-after'))).toBeGreaterThan(3000)
    expect(botDefenseResponse(req('/api/health', '203.0.113.200'))).toBeNull()
    expect(botDefenseResponse(req('/api/health/live', '203.0.113.200'))).toBeNull()
    expect(botDefenseResponse(req('/', '198.51.100.7'))).toBeNull()
  })

  it('never bans a Cloudflare edge address', () => {
    __resetBotDefense()
    expect(botDefenseResponse(req('/.env', '172.70.1.1'))?.status).toBe(404)
    expect(botDefenseResponse(req('/', '172.70.1.1'))).toBeNull()
  })
})
