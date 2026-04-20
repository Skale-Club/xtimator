import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('.env.example documents platform admin env vars (ADMIN-13)', () => {
  const envExamplePath = resolve(process.cwd(), '.env.example')

  it('.env.example exists', () => {
    expect(existsSync(envExamplePath)).toBe(true)
  })

  it('.env.example contains APP_ENCRYPTION_KEY entry', () => {
    const contents = readFileSync(envExamplePath, 'utf8')
    expect(contents).toMatch(/^APP_ENCRYPTION_KEY=/m)
  })

  it('.env.example documents the rotation/generation command "openssl rand -base64 32"', () => {
    const contents = readFileSync(envExamplePath, 'utf8')
    expect(contents).toContain('openssl rand -base64 32')
  })
})
