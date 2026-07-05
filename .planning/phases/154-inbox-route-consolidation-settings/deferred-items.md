# Deferred Items — Phase 154

Items discovered during plan execution that are out of scope for this phase's
route-consolidation work (unrelated subsystems, pre-existing before Phase 154
started). Logged per the executor's scope-boundary rule — not fixed here.

## From Plan 154-03 (test suite update + regression gate)

### 1. `tests/integration/blog-rls.test.ts` — 2 failing tests (pre-existing)

- **Tests:** `getBlogPost returns null for a draft post slug via anon client`,
  `getBlogPost returns post object for a published post slug via anon client`
- **Error:** `TypeError: supabase.from(...).select(...).eq(...).eq is not a function`
  at `lib/queries/blog.ts:42` — the test's Supabase mock doesn't support a
  second chained `.eq()` call.
- **Confirmed pre-existing:** Reproduces in complete isolation
  (`npx vitest run tests/integration/blog-rls.test.ts`), unrelated to any file
  this phase touches. Last real changes to `lib/queries/blog.ts` predate Phase
  154 (Phase 1001 SEO work / Phase 15 blog CRUD).
- **Subsystem:** Public blog (`/blog`), completely unrelated to the
  admin Inbox/WhatsApp surfaces this phase consolidates.

### 2. `tests/unit/components/landing-page.test.tsx` — 1 failing test (pre-existing)

- **Test:** `opens the AuthDialog in login mode when ?auth=login and strips the
  param via router.replace`
- **Error:** `TestingLibraryElementError: Unable to find role="heading" and
  name /sign in to/i` — the AuthDialog portal doesn't render the expected
  heading within the `findByRole` wait window.
- **Confirmed pre-existing:** Reproduces in complete isolation, unrelated to
  any file this phase touches. Last touched by an unrelated quick-task fix
  (`fix(quick-260529-jo8-01): always open auth dialog on landing CTA`).
- **Subsystem:** Public landing page auth modal, completely unrelated to the
  admin Inbox/WhatsApp surfaces this phase consolidates.

### 3. Flaky timeouts under full-suite parallel run (not real regressions)

`tests/unit/cleanup-route-auth.test.ts`, `tests/unit/company-action.test.ts`,
`tests/unit/ai/empty-output-guards.test.ts`,
`tests/unit/ai/transcribe-fallback.test.ts` each showed one `Test timed out
in 5000ms` failure during a full `npm test` run, but all 4 passed cleanly when
re-run together in a smaller batch. This matches the previously-documented
"Windows parallel-import flakes that pass in isolation" pattern (see STATE.md
history) — not a regression introduced by this phase's route-consolidation
edits.

## Note

None of the above 6 failing test files were modified by, or import from, any
file touched by Phase 154 (`app/admin/inbox/**`, `app/admin/whatsapp*/**`,
`lib/actions/admin-whatsapp*.ts`, `tests/unit/settings/tenant-whatsapp-surface.test.ts`,
`tests/e2e/admin-whatsapp.spec.ts`). All WhatsApp/Inbox-related test files
pass green (see 154-03-SUMMARY.md).
