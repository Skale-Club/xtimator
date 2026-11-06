---
quick_id: 261106-alg
date: 2026-11-06
status: complete
---

# Pending estimate visibility correction

Commit `313633c0983729998909296e5a9b2b33f40b7973` changes only the pending estimate aggregate: join `projects!estimates_project_id_fkey!inner(id)` and filter both `projects.archived_at` and `projects.deleted_at` to null. The tenant/current-version/draft-or-sent filters are retained. Accepted/revenue behavior remains historical.

Regression evidence: three new cases failed before the production query change (six counted rather than two visible), then all seven dashboard tests passed. Tests exercise the real Supabase query builder with an HTTP fixture, covering archived/trashed/both/missing parents, another company, superseded versions, viewed estimates, and archive/trash/restore transitions.

Scoped local typecheck passed. Read-only execution of the actual changed TypeScript function against the shared Supabase database returned 19 projects, seven pending estimates, seven accepted and $18,908 accepted value; the original pending query returned 29. No database mutation was needed.

Pushed the correction to main. Test run https://github.com/Skale-Club/xtimator/actions/runs/42219503683 passed both scoped/bare typechecks and both complete unit/eval suite runs. Gitleaks passed. Focused ESLint reported zero errors and two existing unused mock parameter warnings.

Production deployment https://github.com/Skale-Club/xtimator/actions/runs/42221298158 completed successfully, including image build/push, Coolify deploy and Inngest re-sync. An independent cache-bypassed `https://xtimator.com/api/health` request returned HTTP 200, `ok:true`, database/storage/auth healthy and exact deployed commit `313633c0983729998909296e5a9b2b33f40b7973`. The workflow run's own head is a later documentation-only commit; its DEPLOY_SHA correctly pins the tested source commit.

The installed github-workflows skill lacked its referenced `ci_monitor.cjs`; a read-only wrapper was created in ignored `.bg-shell/ci_monitor.cjs` to monitor this repository's workflow runs/jobs through the existing GitHub CLI authentication. It does not dispatch workflows or print credentials.

Unrelated working-tree changes in storage/chat/dashboard components and development preview pages were preserved and excluded from the commit.
