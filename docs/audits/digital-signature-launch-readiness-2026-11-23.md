# Digital signature launch readiness — 2026-11-23

Follow-up: all 12 findings have an implementation in `codex/signature-launch-readiness`; see [corrections and release procedure](digital-signature-fixes-2026-11-23.md). The findings and counts below describe the original audit, before those changes. Production remains unchanged.

**Verdict: NO-GO for enabling digital signatures at the November 24 launch.**

Reviewed checkout `55ec4ce0` on `fix/payment-launch-readiness`, including the local working tree. The existing payment changes belong to another task and were preserved. This investigation changes no application behavior, production records, feature switches, credentials, or deployment. Its additions are this report and reproducible audit probes.

## Scope and evidence

Reviewed estimate and change-order signing endpoints, public responses, owner-recorded responses, company switches, access/password/expiry gates, immutable snapshots and hashes, signature retention, SQL row locks and grants, signature capture, web/editor/paginated/PDF rendering, and response notifications. Existing tests cover both Classic and Modern signature surfaces.

Verification:

- Initial focused Vitest batch: **38 files, 506 tests passed**, 123.05 seconds, one worker.
- UI audit probes: **3 passed**, 4.75 seconds. Actual React/Radix/signature-pad components with synthetic canvas and HTTP boundaries; actual public change-order totals and PDF component tree. Includes resize during an active stroke.
- Data audit probes: **3 passed**, 0.37 seconds. Actual public query/loader code, mocked database boundaries.
- Isolated PostgreSQL probes: **four defects reproduced**, plus a control verifying that both signature evidence tables reject rewriting. PGlite applied the real change-order, snapshot-hash, and estimate timestamp migrations over minimal synthetic parent tables. The ad-hoc change-order writes ran as `authenticated` through the migration's actual grants and membership RLS. The estimate response overwrite models the final UPDATE after a stale application precheck; it is not a multi-connection concurrency test or a complete database migration replay.
- Additional guard/switch/access tests: **20 files, 181 tests passed**, 59.68 seconds, one worker. Combined existing coverage: **58 files, 687 tests passed**. With the six Vitest audit probes: **60 files, 693 tests passed** across the focused runs. ESLint passed for the new probe files.

The probes intentionally assert the defective behavior so the findings can be reproduced. Their passing status **does not certify readiness**. Convert them to regression expectations when implementing each correction.

Commands:

```powershell
npx vitest run tests/unit/audits/signature-ui-readiness-probes.test.tsx tests/unit/audits/signature-data-readiness-probes.test.ts --maxWorkers=1
node docs/audits/digital-signature-db-probes.mjs
```

No real-device/browser session, live customer signing, production database inspection, email delivery, build, or deploy was performed. This is an engineering audit, not a legal opinion or a certificate of signer identity.

## P1 — Correct before enabling signatures

### SIG-01 — An already-signed change order acquires different contract totals

**Sources:** `components/share/change-order-view.tsx:117`, `components/pdf/change-order-pdf.tsx:133`, `lib/change-orders/snapshot.ts:31`.

Both renderers derive “Current contract” and “New total” from today's approved change orders. Sign A for $1,100 on a $10,000 contract: its document shows $11,100. Approve B for $200 and reopen A: the same signature accompanies $11,300. The UI/PDF probe reproduced this on both surfaces. Also, another change order can be approved while A's page is open without changing A's signing version; the displayed contract total is not validated at commit.

**Required:** freeze the before/after contract totals and a contract revision in the signed evidence; validate that revision under a shared contract serialization lock. Separate today's contract summary from A's historical signed document. Serialize concurrent approvals before calculating/persisting project totals.

### SIG-02 — Change-order line changes bypass the page version and the signed renderer

**Sources:** `supabase/migrations/20261117000001_change_orders.sql:205`, `app/api/change-orders/[id]/sign/route.ts:160`, `lib/change-orders/load.ts:83`.

An authenticated company member can directly update change-order items under existing grants/RLS. No item trigger bumps the parent version or refuses writes after acceptance. The PostgreSQL probe changed scope without changing `updated_at`, then successfully called the real signing RPC with the old page version. It also changed an item after signing. The loader selects only signature name/time/image and ignores `signed_content`, so the public page and PDF use the changed live scope with the old signature.

**Required:** protect headers and child rows in the database, invalidate the parent revision for every signable edit, validate a complete content fingerprint, and render signed change orders from the immutable snapshot on all surfaces.

### SIG-03 — A manual response can overwrite an online signature's acceptance

**Sources:** `lib/actions/estimate-response.ts:84`, `lib/actions/estimate-response.ts:105`, `lib/actions/change-order.ts:402`, `lib/actions/change-order.ts:436`.

Both owner actions check for a signature in a separate SELECT, then update the response without an atomic signature/version guard. Interleaving: owner sees no signature; client signs; owner's pending decline/clear lands and overwrites the accepted state while the signature remains. Signature-query errors are also ignored and interpreted as no signature. The SQL probes reproduced both parent overwrites; the change-order overwrite succeeded as `authenticated`.

**Required:** move the signature check, permitted response transition, parent/project update and activity write into a transaction with the same serialization point as signing. Enforce signed-parent invariants at the database boundary and fail closed on evidence-read errors.

### SIG-04 — Client, contractor and project identity remain mutable on signed estimates

**Sources:** `lib/estimate/signed-snapshot.ts:189`, `lib/queries/share.ts:265`, `lib/queries/estimate.ts:179`, `components/workspace/estimate/estimate-document.tsx:2259`.

The snapshot freezes prices, scope and terms but not the document's parties, project name or client address. Share and PDF loaders join today's project/client/company records. The data probe changed client, job and contractor and returned the same signature under those new identities. The content fingerprint does not cover these fields either, so changing them while a page is open does not require the client to review the new identification.

**Required:** freeze the material party and job-identification fields, include them in signing validation, and overlay them in the editor, public page and PDF. Cosmetic branding may remain a separate live choice.

### SIG-05 — Failed signature reads silently produce an unsigned/live document

**Sources:** `lib/queries/estimate-signature.ts:54`, `lib/queries/estimate-signature.ts:76`, `lib/pdf/render-estimate-pdf.ts:128`.

The signature loaders discard database errors and return null, conflating “unsigned” with “could not read evidence.” The data probe injected an evidence-query failure for an accepted estimate: the public query successfully returned live scope without the signature. The PDF uses the same loader and explicitly suppresses certificate-load failures, allowing incomplete evidence to be exported without explanation.

**Required:** distinguish absence, legacy evidence, and retrieval failure. Retry or show a recoverable unavailable state on failure; never silently substitute live content or omit a certificate from a signed export.

### SIG-06 — Cancel/reopen can submit an invisible previous signature

**Sources:** `components/share/estimate-view.tsx:340`, `components/share/change-order-view.tsx:130`, `components/share/signature-pad.tsx:73`.

Draw, enter a name, cancel, and reopen. Radix unmounts the pad, which recreates an empty canvas, but the parent retains the old PNG and enables signing. The UI probe submitted that previous image from a visibly blank pad. Both public flows share the faulty state lifetime.

**Required:** reset the signature data on cancellation/opening or restore the exact submitted drawing into a controlled pad. Test close button, Cancel, backdrop, Escape, mobile swipe, and retry after conflict.

## P2 — Complete the signing experience and evidence

### SIG-07 — The estimate signer cannot obtain a signed PDF through the public flow

`app/api/estimates/[id]/pdf/route.ts:13` requires an owner session; the public estimate has no signed-copy download. Both response-email helpers address the company, not the signer (`lib/estimate/notify-response.ts:121`, `lib/change-orders/notify.ts:95`). A PDF sent before signing remains unsigned. Change orders already offer token-authorized PDF access.

Provide a public signed-copy download with the same password/expiry protections and a deliberate receipt delivery path. Do not expose private owner fields or trust an arbitrary email as verified identity.

### SIG-08 — Stored consent is not the exact statement displayed

The English change-order UI says approval includes the new contract total (`components/share/change-order-view.tsx:631`); its snapshot stores different wording (`lib/change-orders/snapshot.ts:17`). Estimate snapshots always record English while the UI translates the statement into Portuguese/Spanish (`lib/estimate/content-fingerprint.ts:54`, `lib/i18n/translations.ts:347`). The evidence UI labels this as the consent shown.

Use a shared versioned statement per document language; render and persist the same exact wording and locale. This finding concerns evidence accuracy, not a conclusion about legal enforceability.

### SIG-09 — Successful estimate signing does not refresh the signed document

`components/share/estimate-view.tsx:423` changes only the response state. The displayed signature and date still derive from original props (`:251`, `:338`). The client sees acceptance without their new signature/date until reload. Refresh from the authoritative committed result, including idempotent retry results.

### SIG-10 — The owner's acceptance notification points to a nonexistent route

`lib/estimate/notify-response.ts:78` links to `/projects/{projectId}/estimates/{estimateId}`, which has no App Router route or rewrite. Use the existing `/projects/{projectId}?tab=estimate&estimate={estimateId}` pattern. The change-order notification route exists.

### SIG-11 — Expired/locked link errors disappear when the signing sheet closes

`components/share/estimate-view.tsx:408` closes the dialog and sets an error rendered only inside that dialog (`:700`); opening again clears it (`:342`). Render an actionable persistent page notice and disable stale signing actions until reload.

### SIG-12 — Resize during an active stroke can drop part of the exported drawing

`components/share/signature-pad.tsx:135` replaces the stored strokes with transformed copies while the active pointer still holds the original stroke array (`:185`). Further pointer movement paints on screen but updates the old array; export reads the transformed copies (`:213`). The new UI probe draws two segments around a resize and confirms that only one reaches the exported canvas. Verify the correction on actual phones before release.

## Protections that already exist

- Estimate signing commits signature, frozen scope/terms, acceptance, project status and activity in one RPC; missing/changed fingerprint or version is rejected.
- Both signing RPCs are service-role-only and check token/document pairing, response conflicts and parent/current-version conditions under locks.
- Both signature tables reject UPDATE/direct DELETE; signed-parent deletion is guarded, with an explicit compliance erasure path.
- Estimate public writes enforce password unlock and link expiry. Both flows enforce effective platform/company signature switches and reject demo writes.
- Canonical snapshot hashes are reproducible; estimate PDF certificates and owner evidence detail views exist. This verifies stored snapshot integrity, not signer identity or every live field rendered around it.
- Retry handling avoids a second signature after a lost successful response; public decline uses a conditional response write.

## Release exit criteria

1. Fix SIG-01 through SIG-06 and convert their reproductions to expected-behavior regression tests.
2. Freeze and validate complete material document inputs; apply necessary migrations on development, verify their behavior, then obtain the owner's authorization for production migration/release.
3. Verify Classic editor width/page modes, public share and real PDF bytes after signing, subsequent client/project edits, additional approvals, and simulated evidence-read failure. Include Modern smoke coverage since it remains available.
4. Verify signer receipt/download, exact consent, owner notification, retries and persistent error states.
5. On actual iOS Safari and Android Chrome, sign by touch, open the keyboard, rotate while drawing, cancel/reopen, retry after disconnection, and open/save the signed PDF.
6. Re-run focused tests and the required release CI against the final changes; confirm deployed commit and live migrations. Passing the present mocked/source tests alone is insufficient.

Execution routing: session orchestrator performed security/database review, probes and final verification; `gpt-6.2-sol` performed UI/PDF mapping and authored the two UI probes, which the orchestrator inspected and ran. RAM briefly fell below 1 GB; test execution resumed after recovery and stayed at one worker. No unrelated processes were stopped.
