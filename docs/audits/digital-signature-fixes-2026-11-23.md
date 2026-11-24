# Digital signature corrections — 2026-11-23

Implementation branch: `codex/signature-launch-readiness`, based on `dev` at `55ec4ce0`. All 12 findings in the earlier launch audit are addressed in code. These changes are not deployed to production.

## What changed

| Finding | Correction |
| --- | --- |
| SIG-01 | Change orders freeze contract totals before/after approval and the contract revision. The database serializes approvals on the accepted estimate and rejects stale contract revisions. Historical documents use their own frozen totals. |
| SIG-02 | Change-order item writes lock the parent, refuse answered/signed documents and advance its version. Parent scope is checked. Signed readers use stored snapshot items and validate the evidence hash. |
| SIG-03 | Manual responses use transactional RPCs with the same locks as signing. Signature checks, response, project state/total and activity commit together. Signed parent headers reject rewriting independently of application prechecks. |
| SIG-04 | Estimate v3 and change-order v2 snapshots freeze contractor/client/job identity, creator, language and displayed reference fields. Estimate validity is frozen too. Selected-version editor, page preview, public page and PDF overlay the same signed inputs. |
| SIG-05 | Evidence read failures and mismatches interrupt document loading/export. Missing legacy evidence and unreadable evidence are distinct. Certificate reads are tied to the exact signature row. |
| SIG-06 | Every sheet dismissal resets the drawing. Reopening cannot submit an invisible prior PNG. |
| SIG-07 | Accepted estimates expose a token-authorized signed PDF, preserving password/expiry protections. A transactional receipt outbox retries delivery and survives lost worker wakeups. |
| SIG-08 | The UI and snapshot share exact versioned consent text and locale. |
| SIG-09 | Signing returns stored name, image, timestamp and historical totals. Idempotent replies reload the authoritative signed document. |
| SIG-10 | Owner acceptance notifications link to the actual estimate tab. |
| SIG-11 | Expired, locked and outdated pages retain a visible reload notice and stop stale signing attempts. |
| SIG-12 | Resize transforms the active stroke as well as completed strokes; export preserves its continuation. |

## Database and receipt design

Apply `20261123220000_signature_launch_integrity.sql` before deploying the new actions/routes. It adds guarded header/item writes, monotonic change-order content versions, the signing-contract reader and atomic manual responses, and replaces the change-order signing RPC with contract revision checks. The estimate row is the serialization point for all contract-affecting change-order responses; locks proceed change order → accepted estimate → project.

Apply `20261123221000_signature_receipt_outbox.sql` before deployment too. Evidence INSERT triggers create one receipt row per document inside the signing transaction. Anonymous clients cannot access the outbox. The worker claims pending rows with compare-and-set, uses a fixed provider idempotency key, and periodically recovers missed wakeups. It pins the client's existing address and share token by hash and refuses changed/mismatched recipients. Arbitrary signer-supplied email addresses are not delivery destinations. Logs omit the bearer link. Receipt delivery is non-billable and disabled on the Supabase development database, including local production builds.

`20261123222000_signature_receipt_identity.sql` additionally requires the queued recipient's client ID and address to match the frozen signed identity, closing a contact-change race during signing.

All three migrations were applied and read back on the matching Supabase development project, including an exact comparison with their recorded SQL. Production has not been changed. No historical identity or contract totals were backfilled: those facts cannot be recovered by copying today's values. Legacy documents retain the evidence actually recorded, and unavailable historical totals are omitted. Integrity labels describe the stored snapshot, not proof of signer identity.

Actual PDF smoke logs exposed an additional false drift warning: the runtime guard counted the certificate as unexpected overflow and rendered every signed PDF three times. It now includes that fixed page while retaining genuine overflow detection, with regression coverage. Receipt retries end within 12 hours, inside Resend's documented [24-hour idempotency retention](https://resend.com/changelog/idempotency-keys).

## Verification

- Final Chromium desktop end-to-end: passed, 40.6 seconds of browser execution (42.9 seconds total). Actual signature, native PDF download, identity edits, stale contract rejection, reload, second approval, historical PDF text and signature image verification. The signed estimate has exactly two pages, including its certificate.
- Final WebKit/iPhone 13 profile: passed, 10.3 seconds. Chromium/Pixel 7 profile: passed, 7.2 seconds (21.7 seconds combined). Both use real development APIs and PDFs with synthetic touch pointers, and assert no horizontal page overflow before, during and after signing.
- Inspected the final desktop and mobile screenshots and rendered all four PDF pages: estimate body, certificate and two change orders. No clipping or overlap found; historical totals and signature images are preserved. Artifacts remain in ignored `test-results/signature-visual-final/` and `test-results/signature-mobile-final/`.
- Scoped application typecheck passed. Changed-file ESLint passed with one pre-existing unused `photos` warning in the editor. Staged-patch gitleaks scan found no secrets. The final development readback found all three exact migrations and zero remaining signature fixture companies; the test server was stopped.
- Isolated PostgreSQL integrity checks: 22 passed. Receipt migration tests: 7 passed. Final full test results are added before handoff.

Development preparation and isolated SQL checks are repeatable:

```powershell
node docs/audits/signature-integrity-regressions.mjs
node --env-file=<development-env> docs/audits/signature-development-check.mjs
$env:SIGNATURE_E2E_DEV='1'
node --env-file=<development-env> node_modules/@playwright/test/cli.js test --config=playwright.signature.config.ts
```

The browser suite uses Chromium, WebKit/iPhone and Chromium/Android profiles, actual APIs, synthetic per-run data and real generated PDFs. It checks extracted PDF text and embedded image data rather than unstable font subset/object bytes. Python with `pypdf` is required for semantic PDF checks. It removes only the explicitly created fixture company, through the existing evidence-aware compliance erasure function. It sends no real email, SMS, WhatsApp or paid AI calls.

## Production release procedure

1. Review and integrate this branch together with the owner's other launch changes. Do not discard the separate payment/WhatsApp work.
2. With the owner's production authorization, apply only the three migrations above, in timestamp order, using the existing migration runner and the production connection supplied outside chat. Keep migrations and ledger writes transactional.
3. Run required CI against the integrated final commit, then use the existing GitHub Actions → GHCR → Coolify pipeline. Production is not on Vercel.
4. Confirm the deployed commit through health, successful Inngest synchronization and the registered receipt worker. Observe one owner-authorized real delivery and confirm a downloaded signed PDF.
5. Confirm physical iOS Safari and Android Chrome touch/keyboard/rotation behavior before broad public launch. Browser emulation does not replace the actual phones.

No push, merge, production migration, deployment or real receipt delivery is part of this implementation run.
