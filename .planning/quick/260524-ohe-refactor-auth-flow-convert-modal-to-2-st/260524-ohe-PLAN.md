---
phase: quick-260524-ohe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/landing/auth-dialog.tsx
  - components/landing/landing-page.tsx
  - lib/actions/auth.ts
  - lib/supabase/proxy.ts
  - app/(auth)/callback/route.ts
  - app/onboarding/page.tsx
  - app/(app)/layout.tsx
  - app/(app)/dashboard/page.tsx
  - app/(app)/projects/page.tsx
  - app/(app)/clients/page.tsx
  - app/(app)/clients/[id]/page.tsx
  - app/(app)/price-book/page.tsx
  - app/(app)/notifications/page.tsx
  - app/(app)/settings/billing/page.tsx
  - app/(app)/settings/payments/page.tsx
  - app/(app)/settings/custom-domain/page.tsx
  - app/(app)/settings/estimate-templates/page.tsx
  - app/(app)/settings/(tabs)/account/page.tsx
  - app/(app)/settings/(tabs)/company/page.tsx
  - app/(app)/settings/(tabs)/defaults/page.tsx
  - app/(app)/settings/(tabs)/delivery/page.tsx
  - app/(app)/settings/(tabs)/notifications/page.tsx
  - app/(capture)/layout.tsx
  - app/api/stripe/connect/initiate/route.ts
  - app/api/stripe/connect/callback/route.ts
  - lib/actions/settings.ts
  - components/settings/account-section.tsx
  - tests/unit/middleware.test.ts
  - tests/unit/components/landing-page.test.tsx
  - tests/e2e/auth.spec.ts
  - tests/e2e/auth-dark.spec.ts
  - tests/e2e/visual/auth.spec.ts
  - tests/e2e/dark-mode.spec.ts
  - tests/e2e/landing-page.spec.ts
  - tests/e2e/admin-gate.spec.ts
  - tests/e2e/admin-admins.spec.ts
  - tests/e2e/admin-branding.spec.ts
  - tests/e2e/admin-integrations.spec.ts
  - tests/e2e/capture-fullscreen-shell.spec.ts
  - tests/e2e/notifications.spec.ts
  - tests/e2e/onboarding-survey.spec.ts
  - tests/e2e/tour-flow.spec.ts
  - app/(auth)/login/page.tsx (DELETED)
  - app/(auth)/login/login-form.tsx (DELETED)
  - app/(auth)/signup/page.tsx (DELETED)
  - app/(auth)/signup/signup-form.tsx (DELETED)
  - app/(auth)/reset-password/page.tsx (DELETED)
  - app/(auth)/reset-password/reset-password-form.tsx (DELETED)
  - app/(auth)/layout.tsx (DELETED — only callback remains and it's a route handler with no UI)
  - app/(auth)/update-password/page.tsx (NEW — guarded landing for type=recovery callback)
autonomous: true
requirements:
  - AUTHMODAL-01
  - AUTHMODAL-02
  - AUTHMODAL-03
  - AUTHMODAL-04
  - AUTHMODAL-05

must_haves:
  truths:
    - "Clicking 'Start' on the LP opens the modal in signup mode at Step 1 (email + Google + Turnstile + Continue)."
    - "Clicking 'Sign In' on the LP opens the modal in login mode at Step 1 (same Step 1; mode differs only by CTA labels + Step 2 form)."
    - "After valid email + Turnstile, clicking Continue advances to Step 2 with the correct password fields (1 for login, 2 for signup) and a Back button that returns to Step 1 with the email pre-filled."
    - "Clicking 'Forgot your password?' in login Step 2 switches the modal into reset mode at Step 1 with the email pre-filled; submitting sends a reset email and shows an inline confirmation; 'Back to sign in' returns to login mode at Step 1."
    - "Logging out from any authenticated surface redirects to '/' (landing), NOT to /login."
    - "Visiting any protected route (e.g. /dashboard, /projects, /settings) unauthenticated lands on '/?auth=login' and the LP auto-opens the modal in login mode; the param is stripped from the URL after open."
    - "Direct navigation to /login, /signup, or /reset-password returns 404 (routes deleted)."
    - "The OAuth callback (/callback) and Google OAuth flow still work; type=recovery from password reset still lands on an authenticated 'set new password' UI."
  artifacts:
    - path: "components/landing/auth-dialog.tsx"
      provides: "2-step AuthDialog with login | signup | reset modes; step state; carries email across steps; Back/Forgot wiring; success state for reset"
      contains: "step === 'email'"
      contains_also: "mode === 'reset'"
    - path: "components/landing/landing-page.tsx"
      provides: "Reads ?auth=login|signup on mount, opens AuthDialog, strips query param via router.replace"
      contains: "useSearchParams"
    - path: "lib/actions/auth.ts"
      provides: "signOut redirects to '/'; signIn/updatePassword fallback redirects to '/?auth=login'"
      contains: "redirect('/')"
    - path: "lib/supabase/proxy.ts"
      provides: "Unauthenticated protected-route guard redirects to '/?auth=login'; /login|/signup|/reset-password removed from isPublicRoute"
      contains: "url.pathname = '/'"
      contains_also: "url.searchParams.set('auth', 'login')"
    - path: "app/(auth)/callback/route.ts"
      provides: "Fallback redirect changed from /login to /?auth=login; recovery callback still redirects to authenticated set-new-password surface"
    - path: "app/(auth)/update-password/page.tsx"
      provides: "Authenticated landing page that mounts the UpdatePasswordForm after type=recovery code exchange"
  key_links:
    - from: "TopNav 'Start' / 'Sign In' CTAs"
      to: "AuthDialog (open=true, initialMode)"
      via: "onOpenAuth callback in landing-page.tsx"
      pattern: "onOpenAuth"
    - from: "AuthDialog Step 1 'Continue'"
      to: "AuthDialog Step 2 (password)"
      via: "internal step state — only after email schema valid + Turnstile token present"
      pattern: "setStep\\('password'\\)"
    - from: "AuthDialog Step 2 'Forgot your password?'"
      to: "AuthDialog reset mode Step 1 (email pre-filled)"
      via: "setMode('reset') — same dialog, no navigation"
      pattern: "setMode\\('reset'\\)"
    - from: "Any protected page or proxy"
      to: "LP with ?auth=login"
      via: "redirect('/?auth=login') / NextResponse.redirect URL with searchParams"
      pattern: "auth=login"
    - from: "signOut server action"
      to: "Landing page '/'"
      via: "redirect('/')"
      pattern: "redirect\\('/'\\)"
    - from: "/callback?type=recovery"
      to: "/update-password"
      via: "NextResponse.redirect inside app/(auth)/callback/route.ts"
      pattern: "/update-password"
---

<objective>
Collapse the standalone /login, /signup, /reset-password pages into a single in-modal 2-step auth flow (email → password) on the landing page. After this plan:

- The (auth) route group contains only the OAuth `callback/route.ts` route handler plus a new authenticated `update-password/page.tsx` (which mounts after Supabase recovery code exchange). All other (auth) pages and the (auth) layout are deleted.
- AuthDialog is a 3-mode (`login` | `signup` | `reset`) × 2-step (`email` | `password`) state machine that owns: Google OAuth, Turnstile, email field, password field(s), back/forgot wiring, and the reset-email success state — all inside one portal dialog.
- LandingPage auto-opens the modal in the requested mode when the URL contains `?auth=login` or `?auth=signup`, then strips the query param.
- `signOut` now redirects to `/` (landing). Every other "unauthenticated → login" redirect (proxy, server-component guards, server actions, API routes, fallback callback) targets `/?auth=login`.
- Tests and E2E specs that hit `/login` / `/signup` / `/reset-password` are rewritten to drive the LP modal, deleted if they only existed to cover the deleted surfaces, or updated to assert the new URL shape.

Purpose: One canonical authentication surface, fewer cross-page navigations, no email-existence leak (mode is determined by which CTA opens the dialog — locked Option B), and a landing page that can be deep-linked into the right auth state.

Output: A working `AuthDialog`-driven auth flow, deleted legacy pages, an updated proxy, retargeted redirects, and a green unit + e2e suite.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@components/landing/auth-dialog.tsx
@components/landing/landing-page.tsx
@components/landing/landing-nav.tsx
@components/landing/top-nav-auth.tsx
@components/landing/hero-section.tsx
@components/auth/google-oauth-button.tsx
@components/auth/turnstile-widget.tsx
@components/auth/sign-out-button.tsx
@lib/actions/auth.ts
@lib/supabase/proxy.ts
@proxy.ts
@app/(auth)/callback/route.ts
@app/(auth)/login/login-form.tsx
@app/(auth)/signup/signup-form.tsx
@app/(auth)/reset-password/reset-password-form.tsx
@tests/unit/middleware.test.ts
@tests/unit/components/landing-page.test.tsx

<interfaces>
<!-- Existing contracts the executor must preserve. -->

From components/auth/turnstile-widget.tsx (preserved API):
```ts
type TurnstileWidgetRef = { reset: () => void }
type TurnstileWidgetProps = {
  onToken: (token: string) => void
  onExpire?: () => void
}
```

From lib/actions/auth.ts (server actions — signatures unchanged, only redirects change):
```ts
export async function signUp(formData: FormData): Promise<{ error: string } | void>
export async function signIn(formData: FormData): Promise<{ error: string } | void>
export async function signOut(): Promise<void>            // redirect target changes: /login → /
export async function resetPassword(formData: FormData): Promise<{ error: string } | { success: string }>
export async function updatePassword(formData: FormData): Promise<{ error: string } | void>
```

From AuthDialog (new internal state machine — design contract for Task 1):
```ts
type Mode = 'login' | 'signup' | 'reset'
type Step = 'email' | 'password'   // 'password' is unused in reset mode

// State carried inside AuthDialog:
//   mode:  'login' | 'signup' | 'reset'
//   step:  'email' | 'password'
//   email: string                    // pre-filled into Step 2 / reset Step 1 form
//   resetSent: boolean               // shows inline "Check your inbox" instead of form
```

From lib/supabase/proxy.ts (isPublicRoute — login/signup/reset rows REMOVED):
```ts
export function isPublicRoute(pathname: string): boolean
// After change: only '/', '/callback', '/estimate/*', and metadata routes are public.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite AuthDialog into a 3-mode × 2-step state machine (with email carry, Back, Forgot → reset mode, and inline reset-sent confirmation)</name>
  <files>components/landing/auth-dialog.tsx, components/landing/landing-page.tsx</files>
  <behavior>
    Updated unit test scope (in `tests/unit/components/landing-page.test.tsx`, see Task 3 for migration — for this task, design AuthDialog so the following are observable by a Testing Library render):

    AuthDialog (mounted with `open=true`):
    - Renders Step 1 by default: heading reflects mode ('Welcome back' for login, 'Create account' for signup, 'Reset your password' for reset), Google button, email input, Turnstile, "Continue" button. Password field is NOT in the DOM in Step 1.
    - With `initialMode='login'`: footer shows "Don't have an account? Sign up" + "Forgot your password?" links. With `initialMode='signup'`: footer shows "Already have an account? Sign in" only (no Forgot link).
    - Clicking the footer toggle flips the mode but keeps step='email' and carries the typed email into the new mode's email field.
    - With an invalid email (e.g. "abc"), clicking "Continue" shows the email error and does NOT advance to Step 2.
    - With a valid email but no Turnstile token, "Continue" is disabled (or shows the captcha error on click).
    - With a valid email + Turnstile token, clicking "Continue" advances to Step 2. Step 2 renders password field (login) or password + confirmPassword fields (signup), a "Back" button, and the email read-only / pre-filled.
    - Clicking "Back" returns to Step 1 with the email still pre-filled (no Turnstile reset required by the test — but the implementation MUST remount the widget to issue a fresh token per existing pattern).
    - In login Step 2, clicking "Forgot your password?" sets mode='reset' and step='email', pre-filling the email field. Heading becomes 'Reset your password'. Submitting the reset form successfully (mock the server action) replaces the form with an inline confirmation panel containing the email; a "Back to sign in" link returns to login Step 1 with email still pre-filled.

    LandingPage:
    - With URL `?auth=login`, after mount: AuthDialog is open with mode='login'. The query param is removed via `router.replace`.
    - With URL `?auth=signup`, same behavior with mode='signup'.
    - With no `auth` param, AuthDialog is closed.
    - Unknown `auth` value (e.g. `?auth=foo`) is ignored: dialog stays closed and the param is stripped.

    These behaviors are the acceptance contract for Task 1. Tests are wired in Task 3 — implement against this contract first.
  </behavior>
  <action>
Refactor `components/landing/auth-dialog.tsx` end-to-end. Do NOT split into separate sub-files; keep the single-file modal pattern that already exists (one client component, internal sub-components allowed). Preserve all existing visual styling (`inputCls`, `labelCls`, the Xphere card chrome, AppIcon header, OrDivider, XphereGoogleButton).

1. Replace the current `mode` state with two pieces of state and a derived flag:
   - `const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode)`
   - `const [step, setStep] = useState<'email' | 'password'>('email')`
   - `const [email, setEmail] = useState('')`
   - `const [captchaToken, setCaptchaToken] = useState<string | null>(null)`
   - `const [resetSent, setResetSent] = useState(false)` — true after successful resetPassword call (shows the inline confirmation panel inside the same dialog).
   - When `open` flips to true, reset to `step='email'`, `email=''`, `captchaToken=null`, `resetSent=false`, `mode=initialMode`. When `initialMode` changes while open, also reset to `step='email'`.

2. Build three internal step-1 forms that share the SAME visual shell:
   - All Step 1 layouts: Google button (login + signup only, NOT in reset), OrDivider (login + signup only), one email field, TurnstileWidget, and a primary "Continue" / "Send reset link" button.
   - Use a single Step1Form component parameterized by `mode` and `submitLabel`. Its zod schema is `z.object({ email: z.string().email('Please enter a valid email address.') })`. On valid submit, it calls back into the parent with `(emailValue: string) => void`:
     - login/signup → parent sets `email = emailValue`, advances `step = 'password'`. Turnstile token is NOT consumed yet; it stays valid for the server-action call in Step 2.
     - reset → parent calls `resetPassword(FormData{email, captchaToken})` server action; on `{ success }` sets `resetSent = true`; on `{ error }` shows the error and resets the Turnstile widget.
   - The captcha-required gate ("Please complete the CAPTCHA before continuing.") fires at click time when no token is present. Reuse the existing error rendering pattern.

3. Build two Step 2 forms:
   - LoginStep2 — `{ password }` schema. Renders read-only email summary at the top ("Signing in as &lt;email&gt;" — a small muted line, NOT a disabled input), password field with the existing Eye / EyeOff toggle, a primary "Sign in" button, a "Back" link that calls `setStep('email')`, and inline under the input a "Forgot your password?" link that calls `setMode('reset'); setStep('email')`. On submit, builds the FormData with `email` (from parent state) + `password` + `captchaToken`, calls `signIn`. Errors reset the Turnstile and return to Step 1 (so the user gets a fresh token) — implement by calling `turnstileRef.current?.reset(); setCaptchaToken(null); setStep('email')` and surfacing the error in the Step 1 banner via a new `topLevelError` state piece.
   - SignupStep2 — `{ password, confirmPassword }` schema (min 8, must match — copy from current schema). Read-only email summary, password + confirm-password fields with both Eye toggles, "Create account" button, "Back" link. Same error-handling rules.

4. Footer logic (rendered OUTSIDE the card per existing pattern):
   - Mode = login, step = email: show "Forgot your password?" (calls `setMode('reset')`, keeps email), then "Don't have an account? Sign up" (calls `setMode('signup')`, keeps email).
   - Mode = login, step = password: footer shows only the mode-switch line ("Don't have an account? Sign up"). The Forgot link lives inside the form near the password field on Step 2 (per spec).
   - Mode = signup, any step: footer shows only "Already have an account? Sign in" (calls `setMode('login')`, keeps email).
   - Mode = reset, step = email, !resetSent: footer shows "Back to sign in" (calls `setMode('login'); setStep('email')`, keeps email).
   - Mode = reset, resetSent: NO footer (the inline confirmation panel renders its own "Back to sign in" button).

5. Reset-sent inline confirmation: when `resetSent === true`, replace the form area inside the card with:
   - A check-circle icon + heading "Check your inbox"
   - Body text "We sent a password reset link to &lt;email&gt;. Click it to set a new password."
   - A "Back to sign in" button (primary) that runs `setMode('login'); setStep('email'); setResetSent(false)`.

6. Remove the old `window.location.href = '/reset-password'` hack — Forgot is now a mode switch.

7. Update `components/landing/landing-page.tsx`:
   - Convert to read `?auth` via `useSearchParams` + `useRouter` from `next/navigation`.
   - In a `useEffect` that runs once on mount: if `searchParams.get('auth') === 'login' || === 'signup'`, set `authMode` to that value, `setAuthOpen(true)`, then call `router.replace('/', { scroll: false })` (or `pathname` if you want to keep the current pathname — for the LP it's `/`, so `router.replace('/')` is correct).
   - Unknown / missing values: no-op.
   - Keep the existing `openAuth(mode)` callback that is passed to TopNav / Hero / FinalCta / Footer — those callsites do not change.

   NOTE: `landing-page.tsx` is a `'use client'` component. `useSearchParams` requires a `<Suspense>` boundary on the SERVER PARENT (`app/page.tsx`) at build time in some Next 14 configurations. If the build complains, wrap the `<LandingPage />` render inside `app/page.tsx` with `<Suspense fallback={null}>` — but only if the build flags it. Otherwise skip this.

8. Do NOT touch `top-nav.tsx`, `landing-nav.tsx`, `hero-section.tsx`, `final-cta-section.tsx`, `landing-footer.tsx`, or `top-nav-auth.tsx` — they already pass `onOpenAuth` and need no changes for this refactor.

9. Implementation references for behaviors above:
   - Email schema, password schema, confirmPassword refine: copy verbatim from current auth-dialog.tsx lines 29-43.
   - Turnstile remount key pattern (forces fresh token on mode/step switches): use `key={`${mode}-${step}-${resetSent}`}` on the TurnstileWidget element so it remounts whenever the user moves between contexts.
   - All Tailwind classes already in auth-dialog.tsx should be reused — no new design tokens needed.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/components/landing-page.test.tsx tests/unit/middleware.test.ts</automated>
    Plus: `npx tsc --noEmit` (full project) must pass.
  </verify>
  <done>
    - AuthDialog is a single client component with mode/step/email/captchaToken/resetSent state, 3 modes × 2 steps, inline reset-sent panel, no `/reset-password` navigation, no `/login` navigation, and no broken imports.
    - LandingPage auto-opens AuthDialog from `?auth=login|signup` and strips the param.
    - `npx tsc --noEmit` passes (no `any`, no unused imports).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Retarget all redirects (signOut → '/', everything else → '/?auth=login'), update isPublicRoute, update the OAuth callback, and introduce app/(auth)/update-password/page.tsx so the type=recovery flow still has a landing surface</name>
  <files>lib/actions/auth.ts, lib/supabase/proxy.ts, app/(auth)/callback/route.ts, app/onboarding/page.tsx, app/(app)/layout.tsx, app/(app)/dashboard/page.tsx, app/(app)/projects/page.tsx, app/(app)/clients/page.tsx, app/(app)/clients/[id]/page.tsx, app/(app)/price-book/page.tsx, app/(app)/notifications/page.tsx, app/(app)/settings/billing/page.tsx, app/(app)/settings/payments/page.tsx, app/(app)/settings/custom-domain/page.tsx, app/(app)/settings/estimate-templates/page.tsx, app/(app)/settings/(tabs)/account/page.tsx, app/(app)/settings/(tabs)/company/page.tsx, app/(app)/settings/(tabs)/defaults/page.tsx, app/(app)/settings/(tabs)/delivery/page.tsx, app/(app)/settings/(tabs)/notifications/page.tsx, app/(capture)/layout.tsx, app/api/stripe/connect/initiate/route.ts, app/api/stripe/connect/callback/route.ts, lib/actions/settings.ts, components/settings/account-section.tsx, app/(auth)/update-password/page.tsx (NEW)</files>
  <behavior>
    Unit tests after this task:
    - `isPublicRoute('/login')` returns `false` (no longer an auth route — the path no longer exists).
    - `isPublicRoute('/signup')` returns `false`.
    - `isPublicRoute('/reset-password')` returns `false`.
    - `isPublicRoute('/')` returns `true`.
    - `isPublicRoute('/callback')` returns `true`.
    - `isPublicRoute('/dashboard')` returns `false`.
    - The proxy redirect target for an unauthenticated request to a protected route is `/?auth=login` (path = `/`, search contains `auth=login`).

    Behavior to preserve manually verifiable:
    - Signing out from the topbar or admin-topbar lands on `/` and does NOT show the modal.
    - Hitting `/dashboard` while signed out lands on `/?auth=login`; the LP auto-opens the modal in login mode and the query param disappears.
    - The Supabase password-recovery email link still works end-to-end: `/callback?type=recovery&code=...` exchanges the code, then redirects to `/update-password`, where the (authenticated) user can submit a new password via `updatePassword`. On success they land on `/dashboard` or `/onboarding` as before.
  </behavior>
  <action>
1. `lib/supabase/proxy.ts` — update `isPublicRoute`:
   - Remove the three `pathname.startsWith('/login')`, `'/signup'`, `'/reset-password'` lines from the `isAuthRoute` calculation. The function should now treat `/callback` as the only auth-route entry.
   - In `updateSession`, when `!claims && !isPublicRoute(pathname)`, set:
     ```ts
     const url = request.nextUrl.clone()
     url.pathname = '/'
     url.search = ''               // wipe any existing query
     url.searchParams.set('auth', 'login')
     ```
     Keep the existing `set-cookie` propagation block.

2. `lib/actions/auth.ts`:
   - `signOut`: change `redirect('/login')` → `redirect('/')` (this is the locked logout target).
   - `signIn` fallback at the bottom (when claims unavailable after sign-in): `redirect('/login')` → `redirect('/?auth=login')`.
   - `updatePassword` fallback (no claims after update): `redirect('/login')` → `redirect('/?auth=login')`.

3. `lib/actions/settings.ts` line 285 — `return { success: true, redirect: '/login' }` → `return { success: true, redirect: '/?auth=login' }`.

4. `components/settings/account-section.tsx` line 109 — `router.push(result.redirect || '/login')` → `router.push(result.redirect || '/?auth=login')`.

5. `app/(auth)/callback/route.ts`:
   - Recovery branch: keep `type === 'recovery'` handling but change the redirect target from `/reset-password?mode=update` to `/update-password`. (After the code exchange, the user has a valid session — the new `/update-password` page can render the UpdatePasswordForm without needing a query param.)
   - Final fallback at the bottom: `new URL('/login', origin)` → `new URL('/?auth=login', origin)`.

6. `app/api/stripe/connect/initiate/route.ts` and `app/api/stripe/connect/callback/route.ts`: replace `new URL('/login', req.url)` with `new URL('/?auth=login', req.url)`.

7. Server-component guards — for each file below, change `redirect('/login')` → `redirect('/?auth=login')`:
   - app/onboarding/page.tsx
   - app/(app)/layout.tsx
   - app/(app)/dashboard/page.tsx
   - app/(app)/projects/page.tsx
   - app/(app)/clients/page.tsx
   - app/(app)/clients/[id]/page.tsx
   - app/(app)/price-book/page.tsx
   - app/(app)/notifications/page.tsx
   - app/(app)/settings/billing/page.tsx
   - app/(app)/settings/payments/page.tsx
   - app/(app)/settings/custom-domain/page.tsx
   - app/(app)/settings/estimate-templates/page.tsx
   - app/(app)/settings/(tabs)/account/page.tsx
   - app/(app)/settings/(tabs)/company/page.tsx
   - app/(app)/settings/(tabs)/defaults/page.tsx
   - app/(app)/settings/(tabs)/delivery/page.tsx
   - app/(app)/settings/(tabs)/notifications/page.tsx
   - app/(capture)/layout.tsx

   IMPORTANT: do an exhaustive sweep with `Grep("redirect\\('/login'\\)", path=".", type="ts")` before committing — if there are matches outside the list above (excluding `.planning/**`), update them too.

8. Create `app/(auth)/update-password/page.tsx`:
   - Server component. Imports `redirect` from `next/navigation`, `createClient` from `@/lib/supabase/server`, and a new client form component `UpdatePasswordForm` (see step 9).
   - On render: call `await supabase.auth.getClaims()`. If no claims → `redirect('/?auth=login')` (the recovery code exchange should have created a session; if it didn't, this is a legitimate fallback).
   - Render `<UpdatePasswordForm />` wrapped in the same `AuthCard` chrome that the old reset-password page used (import from `@/components/auth/auth-card`).
   - Compute branding via `await getBranding()` to match the old page's behavior.

9. Create `app/(auth)/update-password/update-password-form.tsx`:
   - Client component. Copy the `UpdatePasswordForm` implementation from the old `app/(auth)/reset-password/reset-password-form.tsx` (lines 129-239 inclusive) verbatim. Replace `<Link href="/login">Back to sign in</Link>` at the bottom with `<Link href="/">Back to home</Link>` (logging in again after a password update is uncommon; sending users to the landing is the path of least surprise).
   - The form calls `updatePassword(formData)`; `lib/actions/auth.ts` already handles the success redirect to `/dashboard` or `/onboarding` based on the company check.

10. After all edits run:
    ```bash
    grep -rn "redirect('/login')" --include="*.ts" --include="*.tsx" app lib components | grep -v ".planning"
    grep -rn "redirect('/signup')" --include="*.ts" --include="*.tsx" app lib components | grep -v ".planning"
    grep -rn "'/reset-password'" --include="*.ts" --include="*.tsx" app lib components | grep -v ".planning"
    ```
    All three commands should return zero matches.

11. Do NOT delete the old `(auth)/login`, `(auth)/signup`, `(auth)/reset-password`, or `(auth)/layout.tsx` files in this task — that is Task 3 (after the tests are migrated).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/middleware.test.ts tests/unit/auth-actions.test.ts</automated>
    Also: `npx tsc --noEmit` must pass.
    Plus the three grep sweeps from step 10 must each return zero matches.
  </verify>
  <done>
    - `isPublicRoute` no longer lists `/login`, `/signup`, `/reset-password`.
    - `updateSession` redirects unauthenticated protected requests to `/?auth=login`.
    - Every `redirect('/login')` in app code (excluding `.planning/**`) is gone.
    - `signOut` redirects to `/`.
    - The recovery branch of `/callback` lands on `/update-password`, and that page is implemented + server-guarded.
    - `npx tsc --noEmit` passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Migrate unit + e2e tests to the new modal flow, then delete the legacy (auth) pages and the (auth) layout</name>
  <files>tests/unit/middleware.test.ts, tests/unit/components/landing-page.test.tsx, tests/e2e/auth.spec.ts, tests/e2e/auth-dark.spec.ts, tests/e2e/visual/auth.spec.ts, tests/e2e/dark-mode.spec.ts, tests/e2e/landing-page.spec.ts, tests/e2e/admin-gate.spec.ts, tests/e2e/admin-admins.spec.ts, tests/e2e/admin-branding.spec.ts, tests/e2e/admin-integrations.spec.ts, tests/e2e/capture-fullscreen-shell.spec.ts, tests/e2e/notifications.spec.ts, tests/e2e/onboarding-survey.spec.ts, tests/e2e/tour-flow.spec.ts, app/(auth)/login/page.tsx, app/(auth)/login/login-form.tsx, app/(auth)/signup/page.tsx, app/(auth)/signup/signup-form.tsx, app/(auth)/reset-password/page.tsx, app/(auth)/reset-password/reset-password-form.tsx, app/(auth)/layout.tsx</files>
  <action>
1. `tests/unit/middleware.test.ts` — rewrite the affected assertions:
   - `expect(isPublicRoute('/login')).toBe(true)` → `expect(isPublicRoute('/login')).toBe(false)` and update the test name to "/login is no longer a route (returns false)".
   - Same flip for `/signup` and `/reset-password`.
   - In the "Landing root (/) routing rules" describe block at line 48: change the inline `isAuthRoute` regex so it ONLY tests `pathname.startsWith('/callback')`. The test asserting unauthenticated `/` does not redirect remains valid — keep its assertion.
   - Add a new test: `it('unauthenticated request to /dashboard would redirect to /?auth=login', () => { ... })` that constructs the URL exactly as the proxy does and asserts `url.pathname === '/'` and `url.searchParams.get('auth') === 'login'`.

2. `tests/unit/components/landing-page.test.tsx`:
   - DELETE the two tests "renders a link to /signup" and "renders a link to /login" (lines 56-68). The hero section now uses `onOpenAuth` callbacks, not links — these tests are testing the old contract.
   - Add a new describe block `describe('LandingPage modal auto-open', () => { ... })` with at least two tests that mock `next/navigation`'s `useSearchParams` and `useRouter`, then render `<LandingPage content={...} branding={...} />`:
     - Test A: `useSearchParams` returns `URLSearchParams('auth=login')` — assert that the dialog opens in login mode (look for "Welcome back" heading) AND `router.replace` was called with `'/'`.
     - Test B: `useSearchParams` returns empty — assert no dialog is rendered (heading not found) AND `router.replace` was NOT called.
     - Use minimal `content` and `branding` fixtures (see existing `HERO_CONTENT` in the file for the shape).

3. `tests/e2e/auth.spec.ts`, `tests/e2e/auth-dark.spec.ts`, `tests/e2e/visual/auth.spec.ts`:
   - These specs explicitly visit `/login`, `/signup`, `/reset-password`. Those routes no longer exist.
   - DELETE all three files. Replace with a single new file `tests/e2e/auth-modal.spec.ts` that covers:
     - "LP loads, Start button opens modal in signup mode" — navigate `/`, click the "Start" button in the top nav, assert the dialog is visible with "Create account" heading.
     - "LP loads with ?auth=login, modal auto-opens in login mode" — navigate `/?auth=login`, assert "Welcome back" heading is visible, assert the URL no longer contains `auth=login` after navigation settles.
     - "Visiting /dashboard unauthenticated lands on /?auth=login and modal opens" — navigate `/dashboard`, assert final URL pathname is `/` and the dialog is visible.
   - Keep the file lightweight: no full sign-in / sign-up flow assertions (those need a test user — out of scope for this refactor).
   - For the dark-mode visual coverage that auth-dark.spec.ts used to provide, add a single test inside `auth-modal.spec.ts` that asserts the dialog has the dark Xphere card styling (`document.querySelector('[role="dialog"]')` exists and has the expected dark-theme classes). Visual screenshot snapshots can be added later by the user.

4. `tests/e2e/dark-mode.spec.ts`:
   - Remove `/login` and `/signup` and `/reset-password` from any `PUBLIC_ROUTES` arrays and from any `page.goto('/login')` calls.
   - For each `page.goto('/login')` callsite, replace with `page.goto('/?auth=login')` AND add an `await page.waitForSelector('[role="dialog"]')` before the existing assertions (so the test waits for the modal to mount).

5. `tests/e2e/landing-page.spec.ts`, `tests/e2e/admin-gate.spec.ts`, `tests/e2e/admin-admins.spec.ts`, `tests/e2e/admin-branding.spec.ts`, `tests/e2e/admin-integrations.spec.ts`, `tests/e2e/notifications.spec.ts`:
   - For every `page.goto('/login')` or `page.goto('/signup')` call: replace with `page.goto('/?auth=login')` (login mode is the right default for unauthenticated test bootstrapping). If the test was using `/signup` deliberately, use `page.goto('/?auth=signup')`.
   - For every `await expect(page).toHaveURL('/login')`: replace with `await expect(page).toHaveURL(/\/\?auth=login/)` (regex tolerates Next's URL normalization).
   - For every `if (page.url().includes('/login')) { ... }` (used in test setup helpers like onboarding-survey.spec.ts and tour-flow.spec.ts): replace with `if (page.url().includes('auth=login')) { ... }`.

6. `tests/e2e/capture-fullscreen-shell.spec.ts` line 39: `await expect(page).toHaveURL('/login')` → `await expect(page).toHaveURL(/\/\?auth=login/)`.

7. Run the unit suite + a quick smoke check that all E2E files at least parse (`npx playwright test --list`).

8. ONLY AFTER steps 1-7 pass: delete the legacy (auth) pages. Run:
   ```bash
   rm -rf app/\(auth\)/login app/\(auth\)/signup app/\(auth\)/reset-password
   rm app/\(auth\)/layout.tsx
   ```
   The `app/(auth)/callback/route.ts` route handler MUST remain (Supabase OAuth). The new `app/(auth)/update-password/` directory from Task 2 also remains.

   The `(auth)` layout is being deleted because:
   - Its only remaining consumers would be `callback/route.ts` (a Route Handler — layouts don't apply) and `update-password/page.tsx` (which uses `AuthCard` directly, providing its own chrome).
   - The layout's "Back to home" chrome (the gradient-hero backdrop, the left-side back link) is not needed for an authenticated /update-password landing.
   - If `tsc` or Next build complains after deletion, restore `app/(auth)/layout.tsx` (it's harmless to keep) and document why in the SUMMARY.

9. Final sweep — ensure no stray imports survive:
   ```bash
   grep -rn "auth/login/login-form\|auth/signup/signup-form\|auth/reset-password/reset-password-form" --include="*.ts" --include="*.tsx" app lib components tests
   ```
   Should return zero matches.

10. Run the full unit suite and a Playwright dry-run:
    ```bash
    npx vitest run
    npx playwright test --list   # parse-only, doesn't actually run the browser
    ```
  </action>
  <verify>
    <automated>npx vitest run && npx playwright test --list</automated>
    Plus: `npx tsc --noEmit` and the import-sweep grep from step 9 (zero matches).
  </verify>
  <done>
    - All unit tests pass.
    - All e2e spec files parse cleanly via `playwright test --list`.
    - Legacy (auth)/login, (auth)/signup, (auth)/reset-password directories are deleted.
    - `app/(auth)/layout.tsx` is deleted (or restored with a SUMMARY note if Next required it).
    - `app/(auth)/callback/route.ts` and `app/(auth)/update-password/` survive.
    - No imports reference the deleted files.
    - `npx tsc --noEmit` passes.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete, run the final verification battery:

1. `npx tsc --noEmit` — zero errors.
2. `npx vitest run` — full unit suite green.
3. `npx playwright test --list` — every E2E file parses (we are NOT running them headfully here; that is a separate human checkpoint).
4. Manual repo grep (executor runs these, expects zero matches in `app/`, `lib/`, `components/`, `tests/`):
   - `redirect\('/login'\)`
   - `redirect\('/signup'\)`
   - `href="/login"`
   - `href="/signup"`
   - `href="/reset-password"`
   - `'/reset-password'`
   - `goto\('/login'\)`
   - `goto\('/signup'\)`
   - `auth/login/login-form`
   - `auth/signup/signup-form`
   - `auth/reset-password/reset-password-form`
5. Confirm the modal contract:
   - `grep -n "step === 'email'" components/landing/auth-dialog.tsx` returns matches.
   - `grep -n "setMode('reset')" components/landing/auth-dialog.tsx` returns matches.
   - `grep -n "setResetSent" components/landing/auth-dialog.tsx` returns matches.
6. Confirm the LP query-param hook:
   - `grep -n "useSearchParams" components/landing/landing-page.tsx` returns a match.
   - `grep -n "router.replace" components/landing/landing-page.tsx` returns a match.
7. Confirm the proxy + signOut targets:
   - `grep -n "url.searchParams.set('auth', 'login')" lib/supabase/proxy.ts` returns a match.
   - `grep -n "redirect('/')" lib/actions/auth.ts` returns at least one match (the signOut).
8. Confirm the recovery flow target moved:
   - `grep -n "/update-password" app/(auth)/callback/route.ts` returns a match.
   - `ls app/(auth)/update-password/page.tsx` exists.
</verification>

<success_criteria>
- The standalone `/login`, `/signup`, `/reset-password` pages are deleted from the filesystem.
- All authentication (login, signup, reset request) happens inside `AuthDialog` on the LP.
- The modal is a 2-step state machine with email carried across steps and a Back button on Step 2.
- "Forgot your password?" inside Step 2 switches the modal to reset mode (Step 1 with the email pre-filled). After a successful reset send, the modal shows an inline "Check your inbox" confirmation panel with a "Back to sign in" button — no toast, no page navigation.
- Logout → `/` (landing). Every other unauthenticated redirect → `/?auth=login`. The LP auto-opens the modal in the correct mode based on `?auth=` and strips the param after opening.
- `app/(auth)/callback/route.ts` survives. After Supabase `type=recovery` code exchange the user lands on `/update-password`, which renders the existing UpdatePasswordForm under an authenticated guard.
- `npx tsc --noEmit` is clean, `npx vitest run` is green, `npx playwright test --list` parses every spec.
- Locked decision Option B is honored: there is NO email-existence lookup endpoint anywhere; mode is decided solely by the CTA that opens the modal and by the in-modal footer toggle.
</success_criteria>

<output>
After completion, create `.planning/quick/260524-ohe-refactor-auth-flow-convert-modal-to-2-st/260524-ohe-SUMMARY.md` covering:
- Final shape of AuthDialog (modes, steps, state shape).
- Whether `app/(auth)/layout.tsx` was deleted or restored (and why).
- Whether `app/page.tsx` needed a `<Suspense>` wrapper for `useSearchParams`.
- Any tests that needed deeper rewrites beyond the mechanical changes above.
- Any leftover follow-ups (visual screenshot snapshots for the modal, a future "is this email taken?" UX improvement that was intentionally rejected per Option B, etc.).
</output>
