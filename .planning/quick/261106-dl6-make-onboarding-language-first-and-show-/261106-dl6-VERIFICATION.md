# Verification — five-step onboarding and durable drafts

Status: verified and deployed to production.

- Active flow: language, company, grouped services, general region, combined brand color/logo. No repeated contact, full-address or review steps.
- PT/ES language changes immediately; company validation, Enter/IME handling, focus, service retention/custom entries and custom color behavior exercised in component tests.
- Remote resume, newer offline answers, trusted contact reuse, invalid/legacy storage and empty-draft signup prefills exercised.
- Autosave debounce, close-page flush, reconnect retry and ordered completion exercised. Completed drafts do not reopen from late saves; failed/double completion is retryable/protected.
- Draft endpoints derive ownership from the session, refuse demo writes and unauthorized logo paths. Google SMS activation remains in authentication and is covered by the existing identity endpoint tests.
- Migration `20261106153000_onboarding_drafts.sql` applied to shared prod/dev project `prmqgcrnpuvpzruyzvuv`. Live transactional RLS probe: own read 1, own update revision 1, other-account read/update 0, cross-account insert rejected; all probe data rolled back.
- Live PostgREST accepted the combined completion-lock/sequence filter. No test company or account created.
- Scoped typecheck and lint exit 0. Focused tests including mutation/storage census: 97 passed across 11 files.
- Full Test workflow `42249625868`: both rounds 727 files passed, 6917 tests passed, 6 skipped and 20 existing todo. Gitleaks passed. The initial census omissions were registered in `1cd4494b` without weakening guards.
- Browser preview uses production components with fictitious inputs and disabled completion. Captured all five screens and reduced-height layout. At 390×360: focused company field bottom 254, actions top 266/bottom 343; at 320px no horizontal overflow and final actions fit. Reload restored region and language. This is viewport verification; physical iOS/Android keyboard testing remains a device check.

Release commits: `fb471516` (application), `1cd4494b` (boundary inventories), isolated from unpublished concurrent billing/UI work. Build and Deploy workflow: `42251346668`.

Screenshots and Portuguese explanation are in the sibling `261106-di8` capture task; the local preview route is untracked and absent from the production patch.

Production evidence: Build and Deploy `42251346668` completed successfully, including Coolify rollout and post-deploy Inngest re-sync. A fresh `https://xtimator.com/api/health` request returned `ok:true`, `db:ok`, `storage:ok`, `auth:ok`, commit `1cd4494b017c17478144edce3329dbb903f48e48`.
