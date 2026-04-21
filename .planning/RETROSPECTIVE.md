# Retrospective: EstimateBuilder Pro

## Milestone: v1.0 MVP

**Shipped:** 2026-04-21
**Phases:** 8 | **Plans:** 32 | **Commits:** 151
**Timeline:** 2026-04-09 to 2026-04-21 (12 days)

### What Was Built

1. **Phase 1 — Foundation & Auth:** Next.js 16 + TypeScript strict + Tailwind 4 + 29 shadcn/ui components, 9-table Supabase schema with RLS, full auth flow (email/password + Google OAuth)
2. **Phase 2 — Company Onboarding:** Multi-step wizard capturing business identity (name, industry, logo, color, address, defaults)
3. **Phase 3 — Dashboard & Client Management:** App shell + project list with search/filter/sort + full client CRUD with logo upload
4. **Phase 4 — Project Creation & Workspace:** 3-step project wizard + 5-tab workspace with overview tab and activity timeline
5. **Phase 5 — Audio Recording & Photo Management:** MediaRecorder waveform + Whisper transcription + photo pipeline with drag-and-drop, captions, 20-photo limit, mobile camera capture
6. **Phase 6 — AI Estimate Generation & Editor:** Claude Vision photo analysis + Claude tool_use estimate generation + inline editor with real-time math recalculation + auto-save
7. **Phase 7 — PDF, Sharing, Email & Settings:** @react-pdf/renderer PDF + public share page with accept/decline + Resend email delivery + settings page
8. **Phase 8 — Platform Admin Panel:** AES-256-GCM encrypted API credential store + super-admin gate + /admin/integrations + /admin/branding + /admin/admins + auth dark pass + full env-var/identity sweep

### What Worked

- **Wave-based parallel execution:** Plans with no mutual dependencies ran simultaneously (e.g., 08-01 + 08-02, 08-04 + 08-05 + 08-06 + 08-07). Reduced total wall-clock time significantly vs sequential.
- **GSD plan quality:** Detailed PLAN.md files with explicit , , and  let executor agents operate independently without orchestrator context leakage.
- **TDD discipline on Phase 8:** Writing failing tests first caught a real bug in the plan-provided AES test fixture (34-byte key vs required 32-byte) before it could silently corrupt encrypted data in production.
- **Verifier agent catching build regressions:** The Phase 8 verifier caught the  boundary violation in  that 08-08 had unknowingly introduced — saved a broken production deploy.
- **Singleton platform_branding pattern:** Seeding  at migration time eliminated null-safety branches across every page that reads branding. The pattern proved cleaner than a separate bootstrap step.
- ** marker + vitest alias combination:** Enforced server/client module boundary at both build time (Next.js) and test time (vitest jsdom), catching real violations that would have been runtime errors.

### What Was Inefficient

- **REQUIREMENTS.md tracking drift:** Individual requirement checkboxes were not updated during phases 5-7 execution, requiring a reconciliation pass at milestone close. Traceability fell behind the actual implementation.
- **Usage quota interruptions:** Both Wave 1 agents in Phase 8 hit the Anthropic usage limit mid-task. One agent completed (08-02 SUMMARY.md written), one was partial (08-01 Task 2 artifacts on disk but uncommitted). Required main-thread recovery pass.
- **Checkpoint pattern friction:**  plans with human-verify checkpoints created unnecessary wait points. User pre-approved all checkpoints; the checkpoint mechanism added round-trips that could have been skipped with an explicit  flag.
- ** /  CLI gaps:** Executor agents repeatedly hit errors on these two commands because STATE.md lacked the expected field format and REQUIREMENTS.md did not contain ADMIN-* IDs. Both are pre-existing format gaps that added noise to summaries.

### Patterns Established

- **Page + form server/client split:** Server page fetches branding (or other server-only data) and passes it as props to a  wizard/form. Established in auth pages (Phase 8-07) and onboarding (gap fix).
- ** for integration tests:** Reads  before tests run; keeps  working in vitest without manual shell exports. Committed as a shared setup file.
- ** helper on Supabase BYTEA:** Supabase-js s Buffer values returned from queries. Added  to  to normalise the roundtrip. Required for AES decrypt to work with stored ciphertext.
- **Deny-all RLS by omission:** Tables with no RLS policies (but RLS enabled) are accessible only via service role key. Used for  and  — cleanest posture for platform secrets.
- ** as first line + vitest alias:** Enforces module boundary at both build and test layer. All server-only lib files use this pattern.

### Key Lessons

1. **Mark requirements complete per phase, not at milestone close.** Deferring requirement checkbox updates to the end creates reconciliation debt and makes mid-milestone progress reporting inaccurate.
2. **Pre-approve checkpoints explicitly in config when in auto mode.** Rather than relying on the user to respond to each human-verify gate, a  config flag would eliminate round-trips.
3. **Vitest + server-only requires alias setup upfront.** Add the  alias to  at project scaffold time (Phase 1), not when the first server-only module is introduced (Phase 8). Retrofitting it required updating all existing test runs.
4. **Run the build after every parallel wave.** The 08-07 build passed, but 08-08 broke it by converting  to an async server component. A wave-end build check would have caught this immediately rather than at verification.
5. **The singleton DB pattern eliminates null branching everywhere downstream.** Any data that every page needs (branding, config) should be seeded at migration time to guarantee a row exists from day one.

### Cost Observations

- Sessions: multiple across 12 days
- Model: Claude Opus 4.7 (orchestrator) + executor subagents
- Notable: Parallel Wave 3 (4 agents simultaneously) completed all 4 plans without merge conflicts — git worktrees and  commit discipline kept the index clean
