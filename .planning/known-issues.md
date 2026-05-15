# Known Issues

> Bug + perf-regression registry for milestone v3.1.1 onwards. Each UAT or validation test produces an entry here with PASS / FAIL / DEFERRED verdict.

---

## Phase 68 — Hetzner Deploy Readiness (2026-05-15)

### HETZNER-06 — Local Docker validation: **DEFERRED**

**Reason:** Docker Desktop not installed on dev machine (Windows 11). Validation requires `docker --version` to succeed.

**What's shipped:** Dockerfile, docker-compose.yml, Caddyfile, .env.production.example — all syntax-validated by inspection. Multi-stage Node 22 alpine, non-root user, port 3000, restart unless-stopped, named volumes for cert persistence. Image size estimate ~300-400 MB based on similar Next.js standalone images.

**Deferred to:** v3.2 first deploy. The actual `docker build` + `docker run` + `/api/health` curl will happen on the Hetzner server itself per `docs/HETZNER-DEPLOY.md` Section 7. This is acceptable because:
- The Dockerfile patterns are well-understood (multi-stage Node alpine is standard)
- The smoke check is exactly what the runbook performs as Section 8
- Failure on first deploy is recoverable — `docker compose down && fix && docker compose up -d`

**To validate before v3.2:** Install Docker Desktop on dev machine OR run validation directly on the Hetzner server during the v3.2 first deploy.

### PERF-01 — Lighthouse audit: **DEFERRED**

**Reason:** Lighthouse CLI not installed. Chrome DevTools Lighthouse requires running `npm run dev` and manual operation.

**What we know:** Phase 17 (Navigation Performance) shipped React `cache()` + Skeleton loading + Suspense streaming + HoverPrefetchLink. Phase 13 (Visual Identity Polish) handled icon optimization. Baseline expected to be reasonable but not measured for v3.1.1.

**Deferred to:** v3.2 — Lighthouse will run against the deployed `https://xtimator.com` URL (more meaningful than localhost), captured as part of v3.2 Phase 64 (Monitoring) deliverables.

### PERF-02 — Bundle size: **DEFERRED**

**Reason:** `npm run build` fails with `ENOENT: .env.local` because `.env.local` is a symlink to `G:\My Drive\Dev\xtimator\.env.local` (Google Drive) which is currently unmounted on this machine. Build cannot proceed without env file.

**Workarounds tried:** None — fixing the Google Drive mount is out of scope for this plan.

**Deferred to:** v3.2 first deploy — `npm run build` succeeds on the Hetzner server (where the env file is a normal file, not a symlink). Bundle size captured from CI logs at that point.

---

## Phase 69 — UAT Validation (2026-05-15)

**All 13 UAT requirements DEFERRED to v3.2 first deploy.**

**Rationale:** Manual UAT against localhost requires real WhatsApp Business connection, real Stripe Checkout interaction, real audio recording with multiple takes, real client phone numbers, and ~1-2 hours of focused human time. User chose to defer the validation pass to coincide naturally with the v3.2 first deploy on Hetzner Cloud — testing the deployed app is more meaningful than testing localhost anyway, and avoids running the same UAT twice.

**v3.2 dependency:** Phase 69 work (the test plans 69-01/02/03) carries forward verbatim — same 13 UAT tests, just executed against `https://xtimator.com` instead of `http://localhost:3000`. Test plans remain in `.planning/phases/69-uat-validation-bug-triage-perf-audit/` for re-use.

### UAT-V22-01 — PDF Attachment Delivery: SKIPPED → v3.2
- Reason: requires real WhatsApp Business connection + real client phone
- Re-test in v3.2: Phase 64 UAT against `https://xtimator.com`

### UAT-V22-02 — WhatsApp Status Flow: SKIPPED → v3.2
- Reason: requires real WhatsApp Business connection
- Re-test in v3.2

### UAT-V30-01 — Tier Enforcement: SKIPPED → v3.2
- Reason: needs full setup (3 terminals, real Stripe, real signup flow); deferring with v22 since they share session
- Code is unit-tested (Phase 57); UAT validates real-world behavior in prod

### UAT-V30-02 — Stripe Checkout (test mode): SKIPPED → v3.2
- Reason: requires interactive Stripe Checkout with test card; deferring to prod where it'll be live mode anyway

### UAT-V30-03 — Trial Automation: SKIPPED → v3.2
- Reason: requires waiting for real cron timing or manual DB date manipulation; deferring

### UAT-V30-04 — Stripe Customer Portal: SKIPPED → v3.2
- Reason: same Stripe interactive blocker

### UAT-V30-05 — Admin Tooling: SKIPPED → v3.2
- Reason: needs full setup; deferred with batch

### UAT-V30-06 — 402 Upgrade Modal: SKIPPED → v3.2
- Reason: needs quota-exhausted state; deferred with batch

### UAT-INNGEST-01 — 2-min audio: SKIPPED → v3.2
- Reason: requires Inngest dev running + real audio recording
- Code is unit-tested (Phase 67, 17 GREEN tests); real flow validated in v3.2

### UAT-INNGEST-02 — 8-min audio (timeout-killer): SKIPPED → v3.2
- Reason: same as above; the critical "would-have-timed-out-on-Vercel-Free" assertion happens naturally in v3.2 first paying customer flow

### UAT-STORAGE-01 — All upload paths post-refactor: SKIPPED → v3.2
- Reason: 7 sub-paths × ~2 min each = ~15 min UAT; deferring with batch
- Code is unit-tested (Phase 66, 45 GREEN tests across 4 providers); refactor mechanical and grep-verified

### UAT-E2E-01 — Full happy path: SKIPPED → v3.2
- Reason: needs end-to-end signup flow; deferring to prod

### UAT-E2E-02 — Multi-modal capture: SKIPPED → v3.2
- Reason: 3 capture modes × estimate generation; deferring

### UAT-E2E-03 — i18n smoke (PT-BR + ES): SKIPPED → v3.2
- Reason: deferring with batch

### FIX-01 — Critical bug fixes: N/A (no UAT bugs to triage)
### FIX-02 — known-issues.md exists: PASS (this file)

---

## Milestone v3.1.1 Closeout

- **Total UAT tests:** 13 (UAT-V22 ×2, UAT-V30 ×6, UAT-INNGEST ×2, UAT-STORAGE ×1, UAT-E2E ×3)
- **PASS:** 0
- **FAIL→FIXED:** 0
- **DEFERRED → v3.2:** 13 (all UAT — explicit user choice 2026-05-15)
- **DEFERRED → v3.2 (Phase 68):** 3 (HETZNER-06, PERF-01, PERF-02 — Docker/Lighthouse/build env unavailable)
- **Critical bugs at milestone close:** ZERO observed (no UAT performed)

**v3.1.1 ships its code artifacts (Inngest + Storage + Hetzner Docker + /api/health + runbook).** The validation gate that proves these work end-to-end is consciously moved to v3.2 first deploy — a single UAT pass against the real Hetzner-deployed `https://xtimator.com` covers both the runtime artifact validation (Phase 68 deferrals) AND the feature UAT (Phase 69 deferrals) with the same effort.

**Risk acknowledged:** code may have undiscovered bugs that would have been caught by localhost UAT but won't surface until v3.2 deploy. Mitigation: known-issues.md inherits cleanly to v3.2; first deploy includes a smoke pass; Hetzner runbook supports rapid rollback (`docker compose down`).

**Milestone v3.1.1 ready to archive: YES (with explicit UAT debt logged).**

---

## Triage rules

- **PASS** — verified working, no follow-up
- **FAIL** — blocking, must fix before milestone close
- **FLAGGED** — works but with caveats; documented for future improvement
- **DEFERRED** — out of scope for this milestone, passed forward with explicit rationale and target milestone
