# Completed — shorter, resumable onboarding

Published five language-first questions, grouped service rows, compact color/logo choices, guided Enter/focus behavior and visual-viewport navigation. Removed repeated contacts, full address and review from the active flow. Reused verified account contacts; existing Google SMS activation remains required before onboarding.

Added owner-protected database drafts, server resume, local offline fallback, debounced/close-page saving, reconnect retry, draft-scoped logo uploads and completion/late-write protection. No recovery outreach activated; eligibility guidance is in docs/ONBOARDING.md.

Verification: scoped typecheck/lint passed; 97 focused tests passed; both CI rounds passed 6917 tests. Live DB RLS and PostgREST filter probes passed. Five mobile screenshots plus a reduced-height layout probe were captured in the sibling task. Physical keyboard testing remains a device check.

Application commit fb471516; census follow-up 1cd4494b. Production health confirms the latter. Source was released from an isolated origin/main checkout, preserving concurrent unpublished work and staging in the shared workspace.
