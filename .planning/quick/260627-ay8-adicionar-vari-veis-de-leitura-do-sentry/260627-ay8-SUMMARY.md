---
quick_id: 260627-ay8
status: complete
completed: 2026-06-27
---

# Summary

Added the Sentry API variables to `.env.local` with an empty token and organization slug, plus `SENTRY_PROJECT=xtimator`.

Updated `.env.example` to document the read-only scopes required for issue inspection and the additional source-map upload scope used in CI.

## Verification

- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` each occur exactly once in both files.
- The local auth token remains empty and no real credential was committed.
- `git diff --check -- .env.example` passed.

## Commit

- `c7de2313` — `chore(config): document Sentry read-only credentials`
