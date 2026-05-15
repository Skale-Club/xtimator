import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as routeModule from '@/app/api/inngest/route'

/**
 * INNGEST-01: app/api/inngest/route.ts serve handler (Wave 1 GREEN).
 *
 * Plan 67-02 wires the official `serve()` adapter from `inngest/next`.
 * Contract:
 *   - module exports GET, POST, PUT (the documented triplet)
 *   - serve() is configured with the singleton client + the four jobs
 */
describe('INNGEST-01: app/api/inngest/route', () => {
  it('exports GET, POST, PUT from serve()', () => {
    expect(routeModule.GET).toBeDefined()
    expect(routeModule.POST).toBeDefined()
    expect(routeModule.PUT).toBeDefined()
    expect(typeof routeModule.GET).toBe('function')
    expect(typeof routeModule.POST).toBe('function')
    expect(typeof routeModule.PUT).toBe('function')
  })

  it('serve() is configured with the inngest client + functions array containing all 4 jobs', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'app/api/inngest/route.ts'),
      'utf8'
    )
    expect(src).toMatch(/serve\s*\(\s*\{/)
    expect(src).toMatch(/client:\s*inngest/)
    expect(src).toMatch(/functions:\s*\[/)
    expect(src).toMatch(/generateEstimateJob/)
    expect(src).toMatch(/transcribeAudioJob/)
    expect(src).toMatch(/analyzePhotosJob/)
    expect(src).toMatch(/whatsAppProcessJob/)
  })
})
