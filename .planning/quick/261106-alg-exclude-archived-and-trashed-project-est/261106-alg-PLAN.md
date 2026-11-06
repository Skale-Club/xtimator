---
quick_id: 261106-alg
date: 2026-11-06
status: complete
---

# Exclude hidden projects from pending estimates

1. Add regression coverage for pending estimates belonging to active, archived, trashed, missing, other-company and superseded projects/versions; verify archive/restore transitions.
2. Join the parent project with an inner join in the pending count and filter both archive and deletion timestamps. Preserve current-version/company/status criteria and existing accepted/revenue semantics.
3. Run focused tests, scoped typecheck and a read-only call of the changed function against the shared Supabase data. Expected pending count for the prepared recording account is seven rather than 29.
4. Commit only task files, update the recording guide and project state, publish through the existing CI/deploy pipeline and verify production revision/health. Preserve unrelated working-tree edits.
