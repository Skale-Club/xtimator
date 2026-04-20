import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ADMIN-BOOTSTRAP.md (ADMIN-02)', () => {
  const path = resolve(process.cwd(), 'supabase/ADMIN-BOOTSTRAP.md')

  it('exists', () => {
    expect(existsSync(path)).toBe(true)
  })

  it('contains INSERT INTO platform_admins', () => {
    const body = readFileSync(path, 'utf8')
    expect(body).toMatch(/INSERT\s+INTO\s+platform_admins/i)
    expect(body).toMatch(/user_id/i)
  })

  it('documents APP_ENCRYPTION_KEY rotation', () => {
    const body = readFileSync(path, 'utf8')
    expect(body).toMatch(/APP_ENCRYPTION_KEY/)
    expect(body).toMatch(/openssl rand -base64 32/)
  })
})
