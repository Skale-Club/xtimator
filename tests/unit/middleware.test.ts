import { describe, it } from 'vitest'

describe('Middleware route protection', () => {
  it.todo('/auth/login is accessible without authentication')
  it.todo('/estimate/abc is accessible without authentication')
  it.todo('/dashboard redirects to /auth/login when no session')
  it.todo('/onboarding redirects to /auth/login when no session')
})
