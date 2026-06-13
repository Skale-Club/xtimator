# Deferred Items — quick-260613-9tv

Out-of-scope discoveries found during execution. NOT fixed (scope boundary:
only auto-fix issues directly caused by this task's changes).

## 1. Pre-existing failure: tests/unit/env-var-sweep.test.ts

- **Test:** "no source file outside lib/platform-config.ts reads provider API keys directly" (ADMIN-06)
- **Offenders:** `lib/whatsapp/agent.ts` (line ~111: `apiKey: process.env.OPENAI_API_KEY`)
  and `lib/whatsapp/intent-router.ts`.
- **Status:** Pre-existing on `dev` BEFORE this task — confirmed present at the
  parent commit (HEAD~1). Neither file was modified by this task (clean git status).
- **Why deferred:** Unrelated to the Stripe env-var reconciliation. These WhatsApp
  agent files read `OPENAI_API_KEY` directly instead of routing through
  `getIntegrationKey()`. Fixing requires touching WhatsApp agent wiring — a separate
  concern that belongs in its own task.
- **Suggested follow-up:** A dedicated quick/debug task to route the WhatsApp
  agent's OpenAI key through `getIntegrationKey('openai')`, or add these files to
  the test's EXEMPT set if the direct read is intentional for that subsystem.

## 2. Real-looking Stripe test-mode identifiers in seeds (observation only)

- **Files:** `.planning/seeds/SEED-021-stripe-connect-live-mode-activation.md`
  contains `ca_SmWRqFVGYFFDRXMgEhSwEewL64Pp63Pc` and `we_1TXy61FNcPC8Pzz0V21rbF1q`.
- **Status:** Pre-existing, already committed on `dev`. Not in gitleaks' blocked
  pattern set (`ca_`/`we_` are not secret-key shapes; `ca_` Client IDs are public
  per Stripe docs and appear in browser OAuth URLs). The webhook ID `we_` is also
  not a secret.
- **Why deferred:** The task plan scopes SEED-021 edits to the Vercel→Coolify
  wording and var names only, with an explicit "preserve frontmatter, structure,
  and all other content" directive. These identifiers are outside the changed lines.
- **Note:** Per MEMORY ("No secrets in runbooks") a future cleanup could replace
  these with placeholders, but they are not secrets and are out of scope here.
