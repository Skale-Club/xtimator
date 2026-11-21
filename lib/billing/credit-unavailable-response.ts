import 'server-only'
import { NextResponse } from 'next/server'

/**
 * Owner decision: paid AI never starts when the balance cannot be read. The AI
 * routes answer this retryable 503 (never a 402 paywall: the account is not
 * blocked, we simply could not check it). Customer copy says what happened and
 * what to do, nothing about why.
 */
export const CREDIT_UNAVAILABLE_MESSAGE = "We couldn't start this right now. Please try again."

export function creditUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: 'service_unavailable', message: CREDIT_UNAVAILABLE_MESSAGE },
    { status: 503, headers: { 'Retry-After': '5' } }
  )
}
