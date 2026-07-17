# Requirements: Xtimator — Milestone v4.19 Integrity & Reliability Hardening

**Defined:** 2026-07-17
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Close every finding from the 2026-07-17 six-track adversarial deep audit of the estimate generation & editing system. Source (required reading for every phase plan — all file:line evidence lives there): [audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md).

> **Locked decisions (resolved autonomously per the standing no-checkpoint-interruptions preference):**
> - **Snapshot-on-sign ships BEFORE freeze-on-send.** The snapshot (evidence integrity) is the load-bearing fix and is cheap; the freeze (prevention) follows in the same phase but is the larger change. Both must guard the server actions/routes, not just the UI — RLS has no status predicate.
> - **Freeze policy:** once an estimate has `sent_at` set OR a signature OR a `client_response`, `saveEstimate` and the refine route reject content writes with a typed `estimate_locked` error; the editor surfaces "Create new version" as the path forward. Presentation-settings changes remain allowed (they don't alter priced content — v4.18 behavior preserved).
> - **Atomic save = one Postgres RPC** (`SECURITY INVOKER`, implicit transaction) doing the `updated_at` compare-and-set, the `is_current`/lock guard, all section/item upserts, both orphan-delete passes, and the project-total update — returning new `updated_at` + real row ids so the client remaps temp ids. No multi-call PostgREST sequence survives.
> - **Money stays float-major-units + `Math.round(x*100)/100` in the estimates engine for THIS milestone.** The audit showed pure-float drift is cents-scale and boundary-specific; the dollar-scale bug is preview/engine divergence, fixed by parity (SAVE-07), not by a minor-units migration. A minor-units consolidation is deferred (Future).
> - **Ground-truth audio duration:** prefer Whisper `verbose_json` duration when the endpoint supports it; ALWAYS apply a byte-size sanity clamp (`minutes ≈ bytes×8/bitrate/60`, reject declared duration outside [0.5×, 2×] of the estimate) as the guaranteed layer. Cost/debit/entitlement all key on the server-derived value.
> - **Photo coverage:** batch in chunks of 20 within one Inngest job (per-photo steps already checkpoint), analyze ALL project photos, and surface "N of M photos analyzed" in the capture progress UI. Failed photos skip-and-continue (parity with `ingestMultimodal`); the job fails only if ZERO photos succeed.
> - **Structured photo extraction (vision tool-call schema) is deferred to a future milestone** — this milestone fixes correctness/coverage/metering of the existing prose pipeline first. Captions ship now (cheap, high value).
> - **Capture persistence:** hand-rolled ~100-LOC IndexedDB wrapper (no new dependency), fail-soft on iOS eviction/private mode. TUS resumable upload explicitly deferred — it would break the `StorageProvider` abstraction for low ROI at ≤10MB blobs.
> - **Refine review-before-apply v1 = a summary diff** (changed/added/removed lines with old→new prices) with Apply/Discard — not per-line accept/reject (deferred). Apply merges by matching unchanged rows to preserve ids/created_at; only genuinely new rows get temp ids.
> - **No new AI features in this milestone.** Pure hardening — model behavior may only get MORE deterministic (pinned temperature, higher token ceiling, schema fields the zod gate already accepts).
> - **Verified strengths are regression contracts:** Inngest idempotency/concurrency, GUARD-03 server math, price-research evidence gate, prompt-injection hardening, cross-tenant scoping. Phase plans must not weaken any of them; the audit doc's final section lists them.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Trust Boundary (sign/send integrity)

- [x] **TRUST-01**: When a client signs an estimate, the signature record captures an immutable snapshot of the signed content (sections, items, totals) — and the public share page + PDF render from that snapshot from then on, so what the client sees after signing is always exactly what they signed.
- [x] **TRUST-02**: Once an estimate is sent, signed, or responded to, the save action and the refine route reject content edits server-side with a typed `estimate_locked` error, and the editor guides the owner to "Create new version" instead — no silent in-place mutation of a delivered document is possible from any surface (UI, server action, direct RPC).
- [x] **TRUST-03**: Every content-changing save writes an `estimate_updated` activity event, so edits on drafts (and any pre-freeze edits) are visible in the estimate's audit trail.

### Atomic Save & Version Authority

- [ ] **SAVE-01**: Saving an estimate is atomic — a single transactional RPC performs the concurrency check, all section/item writes, orphan deletes, and the project-total update; a failure leaves the estimate exactly as it was (no partial header/items divergence, no session-poisoning false conflicts).
- [ ] **SAVE-02**: The save path enforces version authority server-side — writes to a non-current version are rejected, and superseding a version bumps its `updated_at` (DB trigger) so a stale open tab can never silently write to an orphaned version.
- [ ] **SAVE-03**: After a successful save, the editor adopts the server-assigned row ids (temp-id remap) and server-computed totals — no re-insert churn on subsequent saves, no duplicate-row window.
- [ ] **SAVE-04**: An edit made while a save is in flight keeps the editor dirty (dirty-epoch reconciliation) — no keystroke is ever stranded unsaved behind a false-clean state with no unload warning.
- [ ] **SAVE-05**: On a genuine concurrency conflict, autosave pauses until resolved and the user gets a non-destructive resolution path — resolving never silently discards their edits, and repeated failing saves/toast stacking cannot occur.
- [ ] **SAVE-06**: Line-item inputs are bounded server-side — negative quantity/unit price/discount/cost/markup are rejected, and section/item count ceilings are realistic (no 100k-item payloads).
- [ ] **SAVE-07**: The editor's live totals preview matches what the server persists for the same inputs — per-category `tax_config` and per-line `taxable` are honored identically on both sides (or the editor adopts server totals on save), and the `taxable` toggle visibly does what it claims in every tax mode.

### AI Reliability & Output Integrity

- [x] **AIREL-01**: Every AI fetch in the codebase carries an explicit timeout (generation, needs-details, price-research web adapters) — a hung upstream can no longer pin a generation job or bypass the provider fallback.
- [x] **AIREL-02**: Estimate generation cannot silently truncate — output token ceiling raised to fit large estimates, `finish_reason` is read, and a length-stop surfaces as a distinct typed error that drives a targeted retry instead of masquerading as malformed JSON.
- [x] **AIREL-03**: The live OpenRouter tool schema requests `taxable`, `tax_category`, `cost`, and `markup_pct` — per-category tax and cost+markup work on the primary provider path, not only via the Gemini fallback.
- [x] **AIREL-04**: Generated estimates pass post-generation consistency checks before persisting — duplicate line detection, qty-0-with-price flagging, and a configurable per-estimate total ceiling that routes to needs-details instead of silently persisting an absurd total.
- [x] **AIREL-05**: Estimate generation runs at a pinned low temperature on all providers — run-to-run price variance is deliberately minimized.

### Billing & Cost Integrity

- [x] **BILL-01**: The refine endpoint is credit-gated like generation — a zero-balance company cannot run unmetered Whisper/Vision/Claude calls through refine. *(167-01: checkCredits + affordance before ingestMultimodal.)*
- [x] **BILL-02**: Audio transcription cost, credit debit, and entitlement checks key on a server-derived duration (Whisper-reported and/or byte-size clamp) — a client-declared duration can no longer under-price transcription. *(167-01: deriveAudioMinutes one-sided 128k byte-clamp.)*
- [x] **BILL-03**: Vision calls carry the job's cost context (attemptId/companyId/projectId) so photo-batch cost roll-up and credit debits record real cost instead of permanently-null reads. *(167-02: analyzePhotoOR's per-photo call in analyze-photos.ts now passes `{ attemptId, companyId, projectId }`; the record-credit-debit read-back finds the vision rows and sums real cost.)*
- [x] **BILL-04**: Retrying a failed generation does not re-pay for transcription — the transcribe job short-circuits when a non-empty transcript already exists. *(167-01: transcript-exists short-circuit before download, cost/debit guarded on !shortCircuited.)*
- [x] **BILL-05**: Cost events are deduplicated per attempt+operation (unique index) and record the provider that actually served (fallback attribution) — measured platform cost is accurate. *(167-01: partial unique index + servedBy attribution.)*
- [x] **BILL-06**: Per-plan audio-minute limits are actually enforced against the server-derived duration — the dead `maxAudioMinutesPerEstimate` entitlement becomes real (or is consciously removed), bounding total transcription spend per plan. *(167-01: NonRetriableError over-cap reject + pre-dispatch belt; behavior-change flagged for owner recalibration.)*

### Photo Pipeline Fidelity

- [x] **PHOTO-01**: User-entered photo captions are included (sanitized) alongside AI descriptions in the estimate generation prompt — typed context like "north wall, 12ft ceiling" is never discarded. *(168-02: generate-estimate.ts folds `photos.caption` into `photoDescriptions` — "Photo N (caption: ...): description" — through the SAME sanitizeField boundary as ai_description; no-caption photos stay byte-identical.)*
- [x] **PHOTO-02**: All of a project's photos are analyzed (batched beyond the current first-20 cutoff), the user sees "N of M photos analyzed" when coverage is partial, and unanalyzed photos can be re-analyzed without re-charging already-analyzed ones. *(168-01: full-coverage chunked analysis + skip-and-continue. 168-02: the UI half — attempt-outcome.ts surfaces the journal's analyzedCount/totalCount/failedCount on the pending payload, poll-outcome.ts forwards them via StageProgress, and capture-processing-overlay.tsx renders "N of M photos analyzed" whenever coverage is partial.)*
- [x] **PHOTO-03**: One failing photo no longer fails the whole batch — per-photo skip-and-continue with the job failing only when zero photos succeed, matching the refine path's policy.
- [x] **PHOTO-04**: Vision descriptions are never silently truncated mid-sentence — `finish_reason` is checked, the token cap is adequate, and the Gemini fallback uses an equivalent cap so both providers produce comparable descriptions.

### Capture & Upload Resilience

- [x] **CAPT-01**: Audio and photo uploads retry automatically with exponential backoff on transient failures before surfacing an error — a network flap no longer costs the user their capture.
- [x] **CAPT-02**: Closing or navigating the tab during the upload/dispatch window triggers an unsaved-work warning (beforeunload extended beyond the recording state).
- [x] **CAPT-03**: A finished recording is persisted locally (IndexedDB) before upload and until dispatch is confirmed — after a failed upload or accidental close, the user can resume the upload instead of losing the recording.
- [x] **CAPT-04**: Orphaned storage objects (uploads whose DB row was never created — including the out-of-credits path — and photo objects with no row) are reconciled by a scheduled cleanup for both the audio and photos buckets.
- [x] **CAPT-05**: The offline/draft UX tells the truth — the false "showing cached data" banner is corrected or removed, and text drafts persist in all three capture flows, not just the new-project wizard.

### Refine Safety & Review

- [ ] **REFINE-01**: Opening refine with unsaved edits flushes (or explicitly confirms) a save first, so the AI always refines the estimate the user is actually looking at and no local edit is silently discarded by the apply.
- [ ] **REFINE-02**: Refinement results are presented as a reviewable change summary (changed/added/removed lines, old→new prices) with Apply/Discard, and applying preserves the identity (ids/created_at) of untouched rows instead of regenerating the entire tree.

## Future Requirements (deferred)

- **FUT-01**: Migrate the estimates totals engine to integer minor units (consolidate with `lib/money`) — deferred; preview-parity (SAVE-07) closes the dollar-scale divergence first.
- **FUT-02**: Structured photo extraction (vision tool-call schema: surfaces/measurements/materials/damage → `photos.ai_extraction JSONB`) — the biggest estimate-quality lever for measurement-heavy trades; ~1.3-1.7× per-photo cost.
- **FUT-03**: Per-line accept/reject in the refine review UI (v1 ships a summary diff with Apply/Discard).
- **FUT-04**: TUS resumable uploads for very large blobs (requires a provider-capability seam in `StorageProvider`).
- **FUT-05**: Editor undo stack (beyond Discard).
- **FUT-06**: Editor performance pass — memoization + row virtualization for 50+ item estimates (audit finding B9; not integrity-critical).
- **FUT-07**: LLM-judge quality gate on generated estimates (beyond the AIREL-04 deterministic checks).

## Out of Scope (this milestone)

- **New AI features / model changes** — pure hardening; behavior may only become more deterministic.
- **Real service worker / offline mode** — CAPT-05 only makes the current UI honest; building actual offline capability is a separate product decision.
- **Whisper language-hint tuning** — low-risk quality tweak, tracked in the audit (D6), can ride any later phase; not integrity work.
- **Dead-code cleanup beyond what phases touch** (e.g. deleting `lib/ai/providers/anthropic.ts`) — hygiene items land opportunistically inside the phase that touches the file, never as their own phase.
- **Per-role (owner vs staff) edit restrictions** — RLS is intentionally role-flat today; a product decision, not an audit fix.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRUST-01..03 | 164 | Complete |
| SAVE-01..07 | 165 | Pending |
| AIREL-01..05 | 166 | Complete |
| BILL-01..06 | 167 | Complete |
| PHOTO-01..04 | 168 | Complete |
| CAPT-01..05 | 169 | Pending |
| REFINE-01..02 | 170 | Pending |
