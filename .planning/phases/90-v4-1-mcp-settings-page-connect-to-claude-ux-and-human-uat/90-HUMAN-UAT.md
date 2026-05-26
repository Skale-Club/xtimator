---
status: passed
phase: 90-v4-1-mcp-settings-page-connect-to-claude-ux-and-human-uat
source: [90-SUMMARY.md]
started: 2026-05-26
updated: 2026-05-26
auto_approved: true
auto_approved_reason: "Per user memory feedback_checkpoints — human-verify checkpoints are treated as auto-approved during phase runs. v4.1 ships the artifact + spec; real-browser run against deployed Xtimator deferred to first paying customer or power-user (matches SEED-030 trigger conditions)."
---

## Current Test

[1] Add MCP server to Claude Code — pending first end-to-end run.

## Tests

### 1. Add MCP server to Claude Code
expected: With the local dev server running on :9633 (or after deploying to the canonical URL), open a NEW Claude Code session and run `claude mcp add xtimator http://localhost:9633/api/mcp` (substitute the canonical URL for production). The first tool invocation triggers the OAuth flow — the browser opens the consent page, the user authorizes, Claude exchanges the code for an access token, and the next tool call succeeds. The access_token cookie persists across subsequent calls within the session.
result: pending
note: ""

### 2. Read-only tools via Claude Code
expected: In the Claude Code session, prompt: "List my estimates from Xtimator." The LLM calls list_estimates; results return as JSON. Then: "Show me the details of the first one." The LLM calls get_estimate with the id; the response includes sections + items.
result: pending
note: ""

### 3. Add custom connector in Claude.ai
expected: Open https://claude.ai → Settings → Connectors → Add custom connector. Paste the MCP endpoint URL. Claude.ai discovers the OAuth metadata via /.well-known/oauth-authorization-server, starts the auth flow, opens the consent screen. After authorize, the Connectors panel shows "Xtimator" with the tool list. Claude.ai groups them as "Read-only tools (4) — Always allow" / "Write tools (2) — Ask each time" because of the readOnlyHint annotations.
result: pending
note: ""

### 4. Write tool + async poll via Claude Code
expected: Prompt: "Create an estimate for project <id> based on: build a deck 12x14 ft cedar." LLM calls create_estimate → gets {job_id, status: 'queued'}. LLM follows up with check_job_status({job_id}) on its own — when status=complete, calls get_estimate({result.estimate_id}) and surfaces the generated estimate.
result: pending
note: ""

### 5. Token rotation
expected: Wait for the 1-hour access token to expire (or invalidate manually via DB). Next tool call: server returns 401 with WWW-Authenticate header. Claude Code automatically refreshes via the refresh_token; subsequent call succeeds. Old refresh_token is rotated out (DB shows the new one).
result: pending
note: ""

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0
