import { test, expect } from '@playwright/test'

test.describe('signup', () => {
  test.todo('user can sign up with email and password (AUTH-01)')
})

test.describe('login', () => {
  test.todo('user can sign in with email and password (AUTH-02)')
})

test.describe('google-oauth', () => {
  test.todo('user can click Continue with Google and be redirected (AUTH-03)')
})

test.describe('session', () => {
  test.todo('session persists across browser refresh (AUTH-04)')
})

test.describe('reset-password', () => {
  test.todo('user can request password reset email (AUTH-05)')
})

test.describe('onboarding-redirect', () => {
  test.todo('new user with no company record is redirected to /onboarding (AUTH-06)')
})

test.describe('signout', () => {
  test.todo('user can sign out and is redirected to /auth/login (AUTH-07)')
})
