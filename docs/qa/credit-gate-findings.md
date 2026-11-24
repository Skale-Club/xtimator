# Estimate continuation credit gate

The paid estimate continuation must stop when it cannot establish spendable credits. The existing policy in `lib/billing/access-guard.ts` distinguishes paid operations from editing and display, which stay available during a billing read outage. A started run may take its next step with one spendable credit and finish the step it starts.

## Hypotheses and expected evidence

`tests/unit/services/generation-credit-read-failure.test.ts` calls the service and its real continuation decision. It substitutes project context and billing reads with synthetic values and intercepts the drafting provider before any request.

| Condition | Required outcome | Existing code path |
| --- | --- | --- |
| Billing configuration read rejects | `BillingBlockedError` with `unavailable` before the provider boundary | The service catch logs the failure and returns an allowed result. |
| Billing company query returns an error or no row while project context loads | `BillingBlockedError` with `unavailable` before the provider boundary | The lenient company lookup resolves the missing billing row as exempt. |
| Non-subscriber lots query fails with a positive cached balance | `BillingBlockedError` with `unavailable` before the provider boundary | The continuation falls back to the cached balance, which does not establish eligible spendable lots. |
| Live subscription balance is confirmed at zero | `BillingBlockedError` with `out_of_credits` before the provider boundary | The decision denies continuation with the existing code. |
| Live subscription balance is confirmed at one credit | The request reaches the intercepted provider | The continuation allows any positive balance. |

The baseline outcomes above come from source inspection. CI must confirm which assertions fail against the baseline and rerun the same tests after the fix.

## Proposed change and retest

1. Make the continuation decision use strict billing reads. Treat missing company data and unavailable spendable lots as unknown balances. Preserve the explicit enforcement-off and company exemption paths, plus the one-credit threshold for in-flight work.
2. In the generation service, map a failed continuation check to `BillingBlockedError('unavailable')`. Preserve the existing specific code for a confirmed insufficient balance and the explicit bypass for already-accounted retry work.
3. In `lib/inngest/credit-pause.ts`, propagate uncertainty as `unavailable` so the job can retry the check before either photo analysis or drafting. Returning `true` admits the next paid step. Returning `false` invokes auto-top-up and the insufficient-credit pause without a confirmed empty balance. Keep those actions on the confirmed-zero path; a billing outage must produce neither a top-up nor an `awaiting_credits` notification.
4. Retest the service regression and the job's confirmed-zero pause/resume behavior. For the job outage case, verify the credit-check step rejects before photo analysis, generation, auto-top-up, or the pause notification.
