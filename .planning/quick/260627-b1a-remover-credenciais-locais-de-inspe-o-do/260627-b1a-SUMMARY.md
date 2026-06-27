---
quick_id: 260627-b1a
status: complete
completed: 2026-06-27
---

# Summary

Removed the Sentry inspection-only variables from `.env.local`.

Kept `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in `.env.example` strictly as build/source-map upload configuration, and documented that operational issue inspection uses the authenticated Sentry MCP.

Authenticated the existing `sentry` MCP server through OAuth. The current Codex thread must be reloaded before its newly authenticated tools become available in the thread tool registry.

## Verification

- No `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT` entries remain in `.env.local`.
- `.env.example` contains one placeholder entry for each build variable.
- `codex mcp list` reports Sentry authentication as OAuth.
- `git diff --check -- .env.example` passed.

## Commit

- `b7bae81d` — `chore(config): reserve Sentry env vars for build`
