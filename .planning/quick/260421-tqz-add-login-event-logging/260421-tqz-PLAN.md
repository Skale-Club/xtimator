---
phase: quick
plan: 260421-tqz
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/auth-logger.ts
  - lib/actions/auth.ts
  - app/(auth)/callback/route.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Every sign-in attempt (success or failure) produces a structured JSON log line server-side"
    - "Every sign-up attempt (success or failure) produces a structured JSON log line server-side"
    - "OAuth callback exchanges produce a structured JSON log line with provider and redirect destination"
    - "Sign-out produces a structured JSON log line"
    - "Password reset request and password update produce structured JSON log lines"
    - "No auth event data is emitted to the browser console"
  artifacts:
    - path: "lib/auth-logger.ts"
      provides: "logAuthEvent() helper — structured JSON console.log, server-side only"
      exports: ["logAuthEvent"]
    - path: "lib/actions/auth.ts"
      provides: "All email/password auth server actions with logAuthEvent calls"
    - path: "app/(auth)/callback/route.ts"
      provides: "OAuth callback route with logAuthEvent call"
  key_links:
    - from: "lib/actions/auth.ts"
      to: "lib/auth-logger.ts"
      via: "import { logAuthEvent }"
    - from: "app/(auth)/callback/route.ts"
      to: "lib/auth-logger.ts"
      via: "import { logAuthEvent }"
---

<objective>
Add structured server-side logging of all auth events so production authentication issues can be monitored and debugged via Vercel logs.

Purpose: Auth failures in production are currently invisible. This adds a lightweight, zero-infrastructure logging layer using structured JSON console.log — captured by Vercel's log pipeline.

Output: lib/auth-logger.ts helper + callsites in the two existing auth files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/actions/auth.ts
@app/(auth)/callback/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create lib/auth-logger.ts helper</name>
  <files>lib/auth-logger.ts</files>
  <action>
Create a new file `lib/auth-logger.ts` with a single exported function `logAuthEvent`.

The function signature:

```ts
type AuthEventName =
  | 'sign_in_attempt'
  | 'sign_up_attempt'
  | 'sign_out'
  | 'oauth_callback'
  | 'password_reset_request'
  | 'password_update'

interface AuthEventPayload {
  event: AuthEventName
  success: boolean
  userId?: string        // Supabase auth.uid when available
  email?: string         // Only log email on attempt/failure events
  provider?: string      // OAuth provider (e.g. 'google')
  redirectTo?: string    // OAuth callback redirect destination
  error?: string         // Sanitized error message (never include raw Supabase error details that may leak schema info)
}

export function logAuthEvent(payload: AuthEventPayload): void {
  // Server-side only guard — never log to browser
  if (typeof window !== 'undefined') return

  console.log(
    JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      service: 'auth',
    })
  )
}
```

Rules:
- The `typeof window !== 'undefined'` guard is mandatory — this function is called from server actions and route handlers that are always server-side, but the guard makes this explicit and safe
- Never log raw Supabase error objects; only log `error.message` string
- Email is acceptable in server logs (it's the identifier); do NOT log passwords or tokens
- Keep the file minimal — no imports from Supabase or Next.js
  </action>
  <verify>
    <automated>cd /c/Users/Vanildo/Dev/xtimator && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>lib/auth-logger.ts exists, exports logAuthEvent, TypeScript compiles without errors</done>
</task>

<task type="auto">
  <name>Task 2: Instrument auth server actions and OAuth callback</name>
  <files>lib/actions/auth.ts, app/(auth)/callback/route.ts</files>
  <action>
Add `import { logAuthEvent } from '@/lib/auth-logger'` to both files, then insert logAuthEvent calls at every auth outcome.

**lib/actions/auth.ts — changes per function:**

`signUp`:
- Before the `if (error)` return: log `sign_up_attempt` with `{ success: false, email, error: error.message }`
- Before `redirect('/onboarding')`: log `sign_up_attempt` with `{ success: true, email }`

`signIn`:
- Inside each `if (error)` return branch: log `sign_in_attempt` with `{ success: false, email, error: error.message }`
- Before `redirect(...)` (success path, after getClaims check): log `sign_in_attempt` with `{ success: true, email, userId: claims.sub }`
- Before final `redirect('/auth/login')` fallback: log `sign_in_attempt` with `{ success: false, email, error: 'claims_unavailable_after_sign_in' }`

`signOut`:
- After `await supabase.auth.signOut()`: log `sign_out` with `{ success: true }`

`resetPassword`:
- Inside `if (error)` return: log `password_reset_request` with `{ success: false, email, error: error.message }`
- Before `return { success: ... }`: log `password_reset_request` with `{ success: true, email }`

`updatePassword`:
- Inside each `if (error)` return branch: log `password_update` with `{ success: false, error: error.message }`
- Before `redirect('/dashboard')`: log `password_update` with `{ success: true }`

**app/(auth)/callback/route.ts — changes:**

After `await supabase.auth.exchangeCodeForSession(code)` and before any redirect:
- If `type === 'recovery'`: log `oauth_callback` with `{ success: true, provider: 'recovery', redirectTo: '/auth/reset-password?mode=update' }`
- After the claims check, before the company-based redirect: log `oauth_callback` with `{ success: true, provider: 'google', userId: claims.sub, redirectTo: company ? '/dashboard' : '/onboarding' }`
- At the fallback `return NextResponse.redirect(new URL('/auth/login', origin))`: log `oauth_callback` with `{ success: false, provider: 'google', error: 'no_code_or_claims' }`

Keep all existing logic intact — only ADD logAuthEvent calls, do not restructure the functions.
  </action>
  <verify>
    <automated>cd /c/Users/Vanildo/Dev/xtimator && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Both files import and call logAuthEvent at every auth outcome; TypeScript compiles clean; no existing logic changed</done>
</task>

</tasks>

<verification>
After both tasks:

1. TypeScript compiles with no errors: `npx tsc --noEmit`
2. Inspect lib/auth-logger.ts: exports `logAuthEvent`, has `typeof window` guard, no external imports
3. Inspect lib/actions/auth.ts: every function has at least one logAuthEvent call on both success and failure paths
4. Inspect app/(auth)/callback/route.ts: logAuthEvent called for recovery, oauth success, and fallback failure cases
5. Confirm no `console.log` calls exist in client components (google-oauth-button.tsx is client-side and must have NO logAuthEvent calls)
</verification>

<success_criteria>
- lib/auth-logger.ts exists with logAuthEvent exported
- All 6 auth event types (sign_in_attempt, sign_up_attempt, sign_out, oauth_callback, password_reset_request, password_update) are logged from server-side code
- TypeScript compiles without errors
- No auth logging in any client component
- Log lines are valid JSON objects with event, success, timestamp, service fields
</success_criteria>

<output>
After completion, create `.planning/quick/260421-tqz-add-login-event-logging/260421-tqz-SUMMARY.md` using the summary template.
</output>
