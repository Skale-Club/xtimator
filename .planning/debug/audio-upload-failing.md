---
status: fixing
trigger: "Audio recording pipeline fails at \"Saving recording\" with generic \"Failed to upload audio file\". Real error swallowed by bare catch {} in capture-recorder.tsx."
created: 2026-05-19T00:00:00Z
updated: 2026-05-19T12:00:00Z
---

## Current Focus

hypothesis: Confirmed root cause (RLS recursion on `public.platform_admins` + storage `platform_brand_*` policies). Applying Option A: SECURITY DEFINER helper `public.is_platform_admin()` + rewrite all six policies to call it.
test: Write migration `20260519000002_fix_platform_admin_rls_recursion.sql`, apply it via `mcp__claude_ai_Supabase__apply_migration`, then run smoke probe SQL: (1) verify pg_proc shows helper with prosecdef=true and search_path=public; (2) verify pg_policies shows all 6 rebuilt policies; (3) `SELECT public.is_platform_admin();` as authenticated role returns false (no 42P17).
expecting: All three smoke checks pass → commit migration → return DEBUG COMPLETE.
next_action: Write migration file, apply, run smoke probe, commit.

## Symptoms

expected: After stopping recording, audio blob uploads to Supabase `audio` bucket, recording row is created, pipeline advances to "Transcribing".
actual: Pipeline reaches "Saving recording", fails with red text "Failed to upload audio file". Retry button + Edit manually buttons appear. Pipeline never advances.
errors: User-facing string is literal "Failed to upload audio file" (i18n key in t()). Underlying Supabase error is silently discarded by bare `catch {}` at components/capture/capture-recorder.tsx:253-256. The provider at lib/storage/supabase-provider.ts:38 throws descriptive `Error("Storage upload failed (audio/{path}): {error.message}")` — but that message never reaches the user or any console.
reproduction: 1. Sign in. 2. Open or create a project. 3. Open audio capture screen. 4. Tap mic, speak briefly, tap to stop. 5. Stepper enters "Saving recording", then fails.
started: User reported 2026-05-19. Recent commits (3647e20, 56204b7, e2e0eba, 66ec605, 1077a05) are UI-only on capture screen — no logic changes to upload path.

## Eliminated

- hypothesis: MIME codec parameter (`audio/webm;codecs=opus`) breaks Supabase Storage MIME allowlist match
  evidence: Live reproduction surfaced literal error `Storage upload failed (audio/.../...webm): The database schema is invalid or incompatible.` — this is the exact message string for SQLSTATE 42P17 (`InvalidObjectDefinition`) per supabase/storage `src/internal/errors/codes.ts:399-403`. A MIME validation failure would surface as HTTP 415 with code `InvalidMimeType` and message `"mime type ... is not supported"`. Not what we saw. The MIME never made it to validation; the failure happens at the PG row-insert step.
  timestamp: 2026-05-19T00:00:00Z

- hypothesis: companyId mismatch (RLS denial) — first-folder of storage path doesn't equal a `companies.id` for `auth.uid()`
  evidence: An RLS denial in Postgres returns SQLSTATE 42501 (`insufficient_privilege`), which storage-api maps to `AccessDenied` with message `"new row violates row-level security policy"` (`knex.ts:1146-1154`). Not what we saw.
  timestamp: 2026-05-19T00:00:00Z

- hypothesis: No browser session / JWT expired
  evidence: Would surface as HTTP 401 with `InvalidJWT` or `Unauthorized` — not 503 with `InvalidObjectDefinition`. Not what we saw.
  timestamp: 2026-05-19T00:00:00Z

- hypothesis: Bucket missing / payload too large / bucket allowlist wrong
  evidence: All produce distinct, specific error messages — `"Bucket not found"`, `"Payload too large"`, `InvalidMimeType`. Not what we saw. Also verified live: bucket `audio` exists, public=false, file_size_limit=52428800 (50MB), allowed_mime_types includes `audio/*`.
  timestamp: 2026-05-19T00:00:00Z

- hypothesis: `storage.objects` table schema is genuinely broken / version drift between Storage server and DB schema
  evidence: Direct INSERT into `storage.objects` via Management API (running as superuser) succeeded immediately (`{"id":"8136aec9-...","name":"__debug_test__/probe.webm","bucket_id":"audio"}`). Schema columns, FK, PK, and triggers are all in the expected post-rollback state for Storage migration ledger id=60 (latest). `storage.migrations` ledger matches the upstream `DBMigration` enum from supabase/storage `src/internal/database/migrations/types.ts` exactly. Absence of `storage.prefixes` table and `level` column is the intentional state because migration files 0026/0029/0042 contain `-- postgres-migrations ignore` which the runner replaces with `SELECT 1;` (verified in `src/internal/database/migrations/migrate.ts:705-707`). So the DB schema is NOT structurally invalid.
  timestamp: 2026-05-19T00:00:00Z

## Evidence

- timestamp: 2026-05-19T00:00:00Z
  checked: components/capture/capture-recorder.tsx:251-256 (the upload try/catch)
  found: Bare `catch {}` with no parameter swallows the real error. No console.error, no toast with the underlying message, no telemetry.
  implication: User-facing "Failed to upload audio file" is a generic fallback. The real error from Supabase is unknown until we surface it.

- timestamp: 2026-05-19T00:00:00Z
  checked: lib/storage/supabase-provider.ts:28-41
  found: Provider does throw a descriptive error: `Storage upload failed (${bucket}/${path}): ${error.message}`. It DOES include the underlying Supabase storage error message.
  implication: Once we change `catch {}` → `catch (err)` and log/toast `err.message`, we'll see the actual Supabase response.

- timestamp: 2026-05-19T00:00:00Z
  checked: lib/utils/media-format.ts:1-13 (getSupportedAudioMimeType)
  found: Returns `audio/webm;codecs=opus` first if supported (Chrome). That string gets passed as contentType to upload.
  implication: Orchestrator H1 (MIME mismatch) is plausible — codec parameter `;codecs=opus` may not match the bucket's `audio/webm` or `audio/*` allowlist. Need to verify against Supabase's actual MIME validation behavior.

- timestamp: 2026-05-19T00:00:00Z
  checked: supabase/migrations/20260409000001_initial_schema.sql:270 (bucket allowed_mime_types)
  found: `audio` bucket allowed_mime_types = `['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/*']`. file_size_limit 50MB.
  implication: `audio/*` wildcard SHOULD accept any audio MIME, including ones with codec params. But Supabase's wildcard handling has known edge cases — needs live verification.

- timestamp: 2026-05-19T00:00:00Z
  checked: components/capture/capture-recorder.tsx:248 (storage path construction)
  found: `${companyId}/${projectId}/${recordingId}.${ext}` — first folder is companyId.
  implication: RLS check `(storage.foldername(name))[1] IN (SELECT id::text FROM companies WHERE user_id = auth.uid())` requires companyId prop == companies.id for logged-in user.

- timestamp: 2026-05-19T00:00:00Z
  checked: app/(capture)/projects/[id]/capture/page.tsx:13-22 + lib/queries/auth.ts:22-36 (where companyId is derived)
  found: `companyId = company.id` from `getCachedCompany(claims.sub)`, which queries `companies WHERE user_id = userId` via service role client. Same user_id source as `auth.uid()` (both = claims.sub / the JWT subject).
  implication: Orchestrator H2 (companyId mismatch) is UNLIKELY in steady state — the SSR page derives companyId from the same user_id RLS uses. Only mismatch path would be: stale `unstable_cache` returning a different company than `auth.uid()` now resolves to (e.g. user switched accounts). For a single-user single-company case, this should match.

- timestamp: 2026-05-19T00:00:00Z
  checked: lib/supabase/client.ts (browser client setup)
  found: Standard `createBrowserClient` from `@supabase/ssr` with NEXT_PUBLIC_SUPABASE_URL + publishable/anon key. No explicit cookie wiring needed — `@supabase/ssr` handles browser session via cookies/localStorage automatically.
  implication: Orchestrator H3 (no session) is unlikely if user sees their avatar (which proves an SSR-authenticated render happened). Browser session should be live too. Still worth confirming via live test once errors are surfaced.

- timestamp: 2026-05-19T00:00:00Z
  checked: Supabase storage validateMimeType algorithm (researched via deepwiki / GitHub docs)
  found: Algorithm splits BOTH the requested MIME and each allowlist entry on `/` only (not `;`). So requested `audio/webm;codecs=opus` becomes `[type="audio", extension="webm;codecs=opus"]`. Allowlist entry `audio/webm` becomes `[type="audio", extension="webm"]`. Comparison `"webm;codecs=opus" !== "webm"` → does NOT match. The codec parameter actively breaks exact-MIME matching. Only the `audio/*` wildcard entry would save us (matching via `allowedExtension === '*'`).
  implication: The fix is straightforward and defensive: strip the codec parameter before passing contentType. `mimeTypeRef.current.split(';')[0]` converts `audio/webm;codecs=opus` → `audio/webm`. This works regardless of whether the live bucket still has `audio/*` in its allowlist.

- timestamp: 2026-05-19T00:00:00Z
  checked: supabase/migrations/ — all subsequent migrations after 20260409000001_initial_schema.sql
  found: No subsequent migration modifies the `audio` bucket or its allowed_mime_types. Only 20260419000001_platform_admin.sql adds a new bucket (`platform-brand`) — unrelated.
  implication: If the live bucket's allowlist still matches the migration, `audio/*` would accept the codec-suffixed MIME. But INSERT uses `ON CONFLICT (id) DO NOTHING` — if a pre-existing `audio` bucket existed (e.g. created in dashboard before migration ran), its allowlist may differ. Stripping codec params makes this irrelevant.

- timestamp: 2026-05-19T00:00:00Z
  checked: Comparison with photo upload path (capture-recorder.tsx:191-198)
  found: Photo upload uses `contentType: 'image/jpeg'` — a hardcoded clean MIME with no codec suffix. That path works (per orchestrator: "if other parts of the app work"). Photo upload is also wrapped in bare `catch {}` (same observability bug) but doesn't fail because the MIME is clean.
  implication: Strong differential evidence. Same RLS rules, same bucket-policy pattern, same browser client, same companyId derivation — only the MIME differs. This points squarely at the audio MIME as the differentiator.

- timestamp: 2026-05-19T00:00:00Z
  checked: User decision on root-cause-confirmation checkpoint
  found: User selected Option B (observability-only). MIME hypothesis is high-confidence but unverified by a live error; user wants the literal Supabase message in hand before changing upload behavior.
  implication: Ship the catch-block patch only. Do not strip codec params yet. Wait for live error.

- timestamp: 2026-05-19T00:00:00Z
  checked: Applied observability patch to components/capture/capture-recorder.tsx
  found: Audio catch (L251-258) now `catch (err)`, logs `console.error('[capture] audio upload failed:', err)`, renders `err instanceof Error ? err.message : t(...)` in the failure card. Photo catch (L194-199) now `catch (err)` + `console.error('[capture] photo upload failed:', err)`; control flow (`continue`) unchanged. `npx tsc --noEmit` returns zero errors in project code (only pre-existing noise in `.next/dev/types/*` Next.js dev-generated files). Committed as e588c14, gitleaks passed.
  implication: Next reproduction will surface the literal Supabase error string on screen and in console.

- timestamp: 2026-05-19T00:00:00Z
  checked: Live reproduction with observability patch in place
  found: User reproduced the upload failure. Failure card now shows the verbatim Supabase error: `Storage upload failed (audio/1b038660-c3d2-48bc-beae-fc29fb6bd27d/ffda0822-77fe-4c9a-9e09-35d50e9b4525/05047882-491a-4f93-9cde-4e1d68739d5d.webm): The database schema is invalid or incompatible.`. Path is well-formed (companyId/projectId/recordingId.webm); bucket `audio` exists.
  implication: MIME hypothesis is REFUTED. The error string `"The database schema is invalid or incompatible."` is the user-facing message for the supabase-storage `InvalidObjectDefinition` error class — defined verbatim at `src/internal/errors/codes.ts:399-403`, HTTP 503. It is only thrown by the storage-api when Postgres returns SQLSTATE `42P17` during a Storage DB query.

- timestamp: 2026-05-19T00:00:00Z
  checked: supabase/storage source — exact mapping of PG SQLSTATE to user-facing error
  found: `src/storage/database/knex.ts:1144-1209` `DBError.fromDBError(pgError, query?)` switch on `pgError.code`. The only branch that produces our exact message is `case '42P17': return ERRORS.InvalidObjectDefinition(pgError)` (line 1182-1186). The factory at `codes.ts:397-403` sets `httpStatusCode: 503, code: ErrorCode.DatabaseInvalidObjectDefinition, message: 'The database schema is invalid or incompatible.'`.
  implication: The live error must originate from a `42P17` raised inside the `INSERT INTO storage.objects` SQL that storage-api ran on our behalf.

- timestamp: 2026-05-19T00:00:00Z
  checked: Live `storage.objects` columns + storage.migrations ledger + storage triggers/indexes/functions/views/constraints (via Supabase Management API SQL query endpoint)
  found: All upstream-canonical for storage-api at migration index 60 (`optimize-existing-functions-again`, last applied 2026-05-06 02:03:21Z). storage.migrations ledger matches `DBMigration` enum in `supabase/storage/src/internal/database/migrations/types.ts` exactly. Absence of `storage.prefixes` and `objects.level` is intentional (migration files 0026/0029/0042 tagged `-- postgres-migrations ignore` → runner replaces SQL with `SELECT 1;`, see `migrate.ts:705-707`). Direct INSERT into `storage.objects` as superuser via Management API succeeded — so the table itself is fine.
  implication: Schema is NOT structurally broken. The 42P17 must come from RLS policy evaluation, not from DDL/column issues.

- timestamp: 2026-05-19T00:00:00Z
  checked: Reproduce the audio INSERT as the `authenticated` role via Management API: `SET LOCAL ROLE authenticated; INSERT INTO storage.objects (name, owner, owner_id, bucket_id, metadata, version, user_metadata) VALUES ('nope/probe.webm', NULL, NULL, 'audio', '{}'::jsonb, 'test', '{}'::jsonb);`
  found: Postgres returned literal error: `ERROR: 42P17: infinite recursion detected in policy for relation "platform_admins"  CONTEXT: SQL statement "INSERT INTO storage.objects (...) VALUES (...)"`. This reproduces the exact 42P17 storage-api maps to `InvalidObjectDefinition`.
  implication: ROOT CAUSE CONFIRMED. The audio upload INSERT triggers RLS evaluation across ALL applicable INSERT policies on `storage.objects`. One of them — `platform_brand_insert_admins` — does `WITH CHECK (bucket_id = 'platform-brand' AND EXISTS (SELECT 1 FROM platform_admins WHERE user_id = (SELECT auth.uid())))`. Even when `bucket_id='audio'` makes the first AND-branch false, Postgres still PLANS the EXISTS subselect, which forces RLS evaluation on `public.platform_admins`. Its own policies (`platform_admins_{select,insert,delete}_admins_only`) are self-referential — `EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (SELECT auth.uid()))` — and re-trigger the same RLS on `platform_admins`. Postgres detects the recursion and raises 42P17.

- timestamp: 2026-05-19T00:00:00Z
  checked: supabase/migrations/20260419000001_platform_admin.sql lines 6, 18-40, 105-109
  found: Line 6 literal comment: `1. public.platform_admins — super-admin membership (self-referential RLS)`. Lines 30-40 create three policies on `public.platform_admins` whose bodies all use `exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()))`. Lines 105-109 create `platform_brand_insert_admins` on `storage.objects` referencing `public.platform_admins` via the same `exists` subselect.
  implication: The recursive design was intentional/documented but the author missed that querying `platform_admins` from within `platform_admins`'s OWN policy is infinite recursion. The bug was dormant while no other RLS-eligible INSERT happened — but as soon as any user tries to write to `storage.objects` for ANY bucket, Postgres evaluates `platform_brand_insert_admins`, which subqueries `platform_admins`, which triggers its self-referential RLS, which recurses.

- timestamp: 2026-05-19T00:00:00Z
  checked: Why platform-brand bucket had ONE successful row (`logo-1777861695749.png`, created 2026-05-04 02:28:16Z) before this bug surfaced
  found: That row predates this failure mode. Either (a) the upload ran with `service_role` (admin onboarding bypasses RLS), or (b) the live recursion-detection path in storage-api+PG was different at that time. Migration 58 `operation-ergonomics` (applied 2026-05-06 — TWO DAYS after the successful platform-brand upload) modified RLS-helper functions, which may have changed how the PG planner inlines/expands subselects in policy CHECK clauses. The user-visible regression timing (post-2026-05-06) is consistent with this hypothesis.
  implication: This is a pre-existing bug that was only exposed after Supabase pushed Storage migration 58. We don't need to depend on a Supabase rollback to fix it — we just need to break the self-reference in our own RLS policies.

## Resolution

root_cause: |
  RLS infinite recursion. The Storage error string `"The database schema is invalid or incompatible."` maps verbatim to supabase-storage's `InvalidObjectDefinition` error (HTTP 503, code `DatabaseInvalidObjectDefinition`), which is only raised when Postgres returns SQLSTATE `42P17`. In our case, every authenticated INSERT into `storage.objects` triggers `42P17: infinite recursion detected in policy for relation "platform_admins"` because:
    1. `supabase/migrations/20260419000001_platform_admin.sql` enables RLS on `public.platform_admins` and creates three policies whose bodies all read `EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = (SELECT auth.uid()))`. This is a self-reference: to evaluate the policy on `platform_admins`, PG must SELECT from `platform_admins`, which re-triggers the policy, ad infinitum.
    2. The same migration adds an RLS policy on `storage.objects` for the `platform-brand` bucket (`platform_brand_insert_admins`, lines 105-109) whose CHECK references `EXISTS (SELECT 1 FROM platform_admins WHERE ...)`. Even though our audio INSERT has `bucket_id='audio'`, PG evaluates ALL applicable policies (OR-combined), so the planner expands the subselect and hits the recursive `platform_admins` RLS.
  The bug is in OUR migration, not in Supabase platform. It became visible recently because Storage migration 58 (`operation-ergonomics`, applied 2026-05-06) likely changed planner behavior around STABLE/inlined subselects in RLS expressions.
fix: |
  Not applied this round (diagnose-only). Recommended remediation options (user picks):

  **Option A — SECURITY DEFINER helper function (canonical Supabase pattern, lowest risk):**
  Create `public.is_platform_admin()` as `SECURITY DEFINER` (runs as table owner, bypassing RLS on the inner query). Rewrite all four policies (`platform_admins_select_admins_only`, `platform_admins_insert_admins_only`, `platform_admins_delete_admins_only`, `platform_brand_insert_admins`, plus `platform_brand_update_admins` and `platform_brand_delete_admins`) to call `public.is_platform_admin()` instead of embedding the recursive EXISTS. The helper internally selects from `platform_admins` with `SET search_path=''` and `SECURITY DEFINER`, so it doesn't re-trigger RLS. Ship as a new migration (e.g. `20260519000002_fix_platform_admin_rls_recursion.sql`).

  **Option B — drop FORCE recursion via `bypassrls` on the helper, keep simple checks:**
  Same as A but use a STABLE SQL function with `SET LOCAL row_security = off` inside, which has the same effect but uses a function attribute instead of `SECURITY DEFINER`.

  **Option C — JWT-claim-based check (smallest diff, requires JWT enrichment):**
  Add a `platform_admin: true` claim to the JWT for platform admin users (via a Supabase auth hook or custom JWT). Then policies can check `(auth.jwt() ->> 'platform_admin')::boolean` without ever querying `platform_admins`. Requires more infrastructure changes.

  **Option D — drop self-referential RLS on `platform_admins`, rely on service-role-only access:**
  If the only writes to `platform_admins` come from a service-role server action (no direct authenticated client mutation), DROP all three `platform_admins_*_admins_only` policies and leave the table with RLS enabled but no policies (deny-all to `authenticated`). Then ALSO rewrite `platform_brand_insert_admins` and friends to use a SECURITY DEFINER helper (back to Option A for the storage policies). Simplest if there's no client-side admin UI mutating `platform_admins`.

  Recommended: **Option A**. It's the canonical Supabase fix for self-referential RLS, well-documented, mechanical to apply, and idempotent (the new migration replaces the existing policies via `DROP POLICY IF EXISTS` + `CREATE POLICY`).
verification: |
  Not applied this round. When fix is shipped, verify by:
    1. Repro: sign in as a normal (non-admin) user, record audio in the capture flow, stop — pipeline should advance from "Saving recording" to "Transcribing".
    2. SQL probe: as authenticated role with a fake JWT claim, INSERT into `storage.objects` with `bucket_id='audio'`. Should succeed (or fail with 42501 RLS denial, never 42P17).
    3. Admin path: sign in as a platform admin user, upload to `platform-brand` bucket via the admin UI. Should still succeed.
    4. Admin RLS: as authenticated platform admin, `SELECT * FROM platform_admins` should return rows (the SELECT policy must still work post-fix).
files_changed:
  - components/capture/capture-recorder.tsx (catch blocks at L194-199 photo, L251-258 audio) — committed in e588c14
  - (pending, not applied): supabase/migrations/20260519000002_fix_platform_admin_rls_recursion.sql
