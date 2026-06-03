# Deferred Items — quick task 260603-lrf

Pre-existing failures discovered during execution but OUTSIDE the scope of this
task (not caused by any file this task modified). Logged, not fixed.

## 1. tests/unit/inngest/whatsapp-process-job.test.ts — 2 failures

- **Status:** Pre-existing (failing before this task started).
- **Cause:** Quick task 260602-mq2 moved the per-message processing,
  `generate-estimate`, and vagueness steps OUT of
  `lib/inngest/functions/whatsapp-process.ts` and INTO
  `lib/whatsapp/estimate-graph.ts` (LangGraph). The test still greps the old
  source patterns (`process-${...}`, `step.run('generate-estimate')`,
  `isVagueEstimate(`, `awaiting_details`, `evaluate-vagueness`, `ask-details`)
  in whatsapp-process.ts, which no longer live there.
- **Why not fixed here:** This task did not touch whatsAppProcessJob; the failing
  assertions belong to the 260602-mq2 refactor and should be updated to read
  estimate-graph.ts (or the test rewritten to assert graph wiring). The
  whatsAppProcessJob contract test (id + idempotency) still passes.

## 2. tests/unit/whatsapp/client.test.ts — 3 failures

- **Status:** Pre-existing (commit 6ab78e4, before this task).
- **Cause:** `lib/whatsapp/client.ts` GRAPH_BASE was changed to
  `https://graph.facebook.com/${process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'}`.
  The tests hardcode the literal `graph.facebook.com/v21.0` URL and the
  download/read-receipt URL assertions, which now mismatch under that commit's
  template-string base.
- **Why not fixed here:** This task did not modify client.ts or client.test.ts.

## 3. tests/unit/whatsapp/integrations-page.test.tsx — 1 failure

- **Status:** Pre-existing, unrelated UI test ("no setup required" /
  "Messaging channels card"). getByText matched multiple elements.
- **Why not fixed here:** No files for this surface were touched by this task.
