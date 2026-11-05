'use client'

import type { Auth, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth'

export interface IdentityConfig { apiKey: string; projectId: string; authDomain: string }
let initializing: Promise<Auth> | undefined
let confirmation: { phone: string; result: ConfirmationResult } | undefined
let captcha: RecaptchaVerifier | undefined
let node: HTMLDivElement | undefined
let generation = 0

async function prepare(config: IdentityConfig) {
  initializing ??= (async () => {
    const [apps, sdk] = await Promise.all([import('firebase/app'), import('firebase/auth')])
    const app = apps.getApps().find(value => value.name === 'xtimator-auth') ?? apps.initializeApp(config, 'xtimator-auth')
    const auth = sdk.getAuth(app)
    await sdk.setPersistence(auth, sdk.inMemoryPersistence)
    auth.useDeviceLanguage()
    return auth
  })().catch(error => { initializing = undefined; throw error })
  return initializing
}

export function cancelPhoneChallenge() {
  ++generation; confirmation = undefined
  captcha?.clear(); captcha = undefined; node?.remove(); node = undefined
}

export async function requestPhoneCode(config: IdentityConfig, phone: string) {
  cancelPhoneChallenge()
  const current = generation
  const [auth, sdk] = await Promise.all([prepare(config), import('firebase/auth')])
  if (current !== generation) throw new DOMException('Cancelled', 'AbortError')
  const container = document.createElement('div')
  document.body.appendChild(container); node = container
  const challenge = new sdk.RecaptchaVerifier(auth, container, { size: 'invisible' })
  captcha = challenge
  try {
    const result = await sdk.signInWithPhoneNumber(auth, phone, challenge)
    if (current !== generation) throw new DOMException('Cancelled', 'AbortError')
    confirmation = { phone, result }
  } finally {
    if (captcha === challenge) { captcha.clear(); captcha = undefined; container.remove(); if (node === container) node = undefined }
  }
}

export async function confirmPhoneCode(phone: string, code: string) {
  if (confirmation?.phone !== phone) throw Object.assign(new Error('Request a new code.'), { code: 'auth/code-expired' })
  return (await confirmation.result.confirm(code)).user.getIdToken(true)
}

export async function googleIdentityLogin(config: IdentityConfig) {
  const [auth, sdk] = await Promise.all([prepare(config), import('firebase/auth')])
  const provider = new sdk.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return (await sdk.signInWithPopup(auth, provider)).user.getIdToken(true)
}

export function identityError(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled. Try again when you are ready.'
  if (code === 'auth/popup-blocked') return 'Allow the sign-in popup in your browser and try again.'
  if (code === 'auth/invalid-phone-number') return 'Enter a valid phone number, including the country code.'
  if (['auth/invalid-verification-code', 'wrong_code'].includes(code ?? '')) return 'That code is incorrect. Check your message and try again.'
  if (['auth/code-expired', 'auth/session-expired', 'challenge_expired'].includes(code ?? '')) return 'This verification expired. Start again and request a new code.'
  if (['auth/too-many-requests', 'auth/quota-exceeded', 'rate_limited'].includes(code ?? '')) return 'Too many attempts. Please wait before trying again.'
  if (['auth/network-request-failed', 'auth/captcha-check-failed', 'auth/invalid-app-credential'].includes(code ?? '')) return 'We could not complete phone verification. Check your connection and try again.'
  if (code === 'identity_conflict') return 'This identity belongs to another account. Recover your existing account to continue.'
  if (code === 'account_recovery_required') return 'An existing account needs verification. Choose “Recover existing account” below.'
  if (code === 'reauthentication_required') return 'Sign out and sign in again with your current phone or Google before changing account sign-in details.'
  if (code === 'account_disabled') return 'This account is unavailable. Contact support.'
  return 'Sign-in is temporarily unavailable. Please try again.'
}
