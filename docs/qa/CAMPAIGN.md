# Xtimator acceptance campaign

The campaign exercises Xtimator against its existing Supabase development project, using isolated synthetic tenants. It expands through explicit hypotheses and observed failures; the manifest defines the current required scenarios, browser matrix and separate launch capabilities. Added scenarios still need passing browser evidence. The [manifest](../../tests/qa/manifest.json) is the acceptance contract.

## Scope and evidence

| Outcome | Evidence expected |
| --- | --- |
| Owned session | An isolated owner reaches the workspace and an unauthenticated request is redirected. The fixture starts with an already-issued owned session. |
| Tenant isolation | Two tenants have persisted data. The browser cannot load the second tenant's private project or authenticated PDF. |
| Client lifecycle | An owner creates, reads, updates and deletes a synthetic client. The expected database state follows the UI mutations. |
| Estimate edit | The edited content survives reload and reaches the public document with the original total. The desktop scenario also exercises the editor's paginated and full-width controls. |
| Public estimate | An anonymous browser reaches the seeded document, and an unknown token returns a not-found response. |
| Signature and PDF | Public signing writes the acceptance and signature evidence. The signed PDF renders the expected document content. |
| Capture pipeline | Synthetic media passes through the app, API and local Inngest handlers to a persisted draft. Transcription and generation replies come from controlled provider simulations. |

Chromium desktop, emulated iPhone WebKit and emulated Android Chromium are the default evidence projects. Every initial scenario requires all three. The manifest supports an explicit project list per scenario when its contract justifies a different matrix.

The report inventories `app/**/page.tsx` and lists each URL, source file, surface and mapped scenario. It preserves dynamic segments and distinguishes workspace, public, identity, admin and development surfaces. Route mappings indicate where expected evidence applies. Unmapped routes, UI states, API methods and jobs still need their own acceptance contracts.

The initial campaign uses synthetic tenant data, creates isolated sessions, and erases each fixture after use. The app runs on loopback and the fixture checks the exact Supabase development origin. Email, SMS, and payment effects are disabled for fixture companies. The campaign currently has explicit public-launch blockers for Google Identity, provider delivery, Stripe sandbox processing, live AI, physical capture, accessibility, platform admin, change-order lifecycle and deployed smoke verification.

## Run and interpret the reports

The isolated acceptance job runs automatically on pushes to `dev` and pull requests whose source repository is `Skale-Club/xtimator`. Fork pull requests receive the secret-free unit/eval checks; they cannot access the dedicated development credentials. Feature branches can also dispatch `Test` with `qa=true`. Development campaigns are serialized to avoid competing background workers. A main push retains its full unit/eval gate and production deployment behavior; it does not start the development acceptance job.

The CI job uses `--execution-only`: green means the implemented mandatory scenarios passed in their complete browser matrix. The report still blocks public launch until the separate real-provider, identity, device and release-environment capabilities have evidence. This job is not itself a production release or a claim of complete product coverage.

The trusted development triggers also compile a production-mode Next.js artifact with development public configuration and synthetic Academy content. Feature branches can request that job with `verify_build=true`. It receives no service-role, provider or deployment credentials and does not publish an image. Compilation is separate from the actual release-environment smoke gate.

Normal fixture teardown removes each generated tenant. A separate dependent cleanup job recovers leftovers after the acceptance workers stop, even when their job fails. It uses the acceptance job's recorded run attempt, so rerunning cleanup cannot select another active attempt. Foreign markers, ownership, memberships and unknown storage objects abort recovery. Cleanup failure remains a CI failure; it does not turn a failed acceptance run green. Fixtures created before campaign markers were added are excluded.

Use the campaign runner from the repository root on a machine with enough memory to run Next.js, Inngest and a browser together. It requires the repository dependencies, Playwright browsers, Python 3 with `pypdf`, and the designated development credentials. Use the approved development environment and keep credentials outside tracked files. The browser profiles exercise emulated viewports and browser engines. Real-device capture has a separate gate.

The runner requires `XTIMATOR_QA_DEV=1`, `DATA_API_MODE=supabase`, `NEXT_PUBLIC_AUTH_MODE=owned`, the development Supabase URL in `NEXT_PUBLIC_SUPABASE_URL`, and credentials in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `XTIMATOR_DATA_JWT_SECRET`. When `DATA_API_UPSTREAM_URL` is set, it must point to the same development origin.

```sh
npm run qa:campaign -- --execution-only
npm run qa:campaign
```

The runner preserves the previous report before starting another run. Use `--project=chromium`, `--project=mobile-safari` or `--project=mobile-chrome` to target a browser while diagnosing a failure. A partial matrix leaves required browser evidence missing and exits with a blocked verdict.

The evidence evaluator can read an existing Playwright JSON report without starting the app or a browser.

```sh
node --test scripts/qa/coverage.test.mjs
node scripts/qa/coverage.mjs
node scripts/qa/coverage.mjs --execution-only
```

The evaluator reads `qa-results/playwright.json` by default. `--report <path>` selects another Playwright JSON report. A new campaign needs a report from that run. Preserve prior evidence outside the active results paths before rerunning. The evaluator writes `qa-results/coverage.json` and `qa-results/coverage.md`.

The public-launch command exits successfully only when all mandatory scenario and capability evidence is satisfied. The execution-only command exits successfully when the required initial scenarios pass and keeps the public-launch verdict blocked. Missing, skipped, unexpected, flaky, retried, empty and duplicate evidence cannot count as a pass. A test needs one clean first attempt in every required project. A test title must contain one `[QA:ID]` token matching the manifest entry.

## Hypothesis, evidence and retest

The expanded scenarios cover native capture with synthetic media/provider output, project/settings/price-book persistence, exhausted generation retries, microphone refusal, stale document signing, editor hydration, automated accessibility rules, client keyboard interaction, public/workspace screen rendering, rejection of forged provider callbacks and change-order approval/decline. A rendered screen does not prove all of its controls or states. A synthetic provider result does not establish live provider quality or delivery.

1. Record the user-visible behavior in the manifest and identify the pages it exercises. Write the expected UI, API or persisted result before changing the scenario.
2. Use the matching `[QA:ID]` title in the test. Assert the observable behavior and retain the smallest useful evidence, such as a screenshot, signed document or persisted-state check.
3. Read the matrix and capability results after the run. Compare the observed outcome with the expected one. Classify a failure using the report, then inspect the private local Playwright artifacts if needed.
4. Fix the cause in the app, fixture or test. Preserve the behavior asserted by the manifest and record what changed.
5. Rerun the failing case to verify the fix. Run the complete required matrix for release evidence and record the Git revision, tested environment, result and duration. Keep raw artifacts local unless reviewed for sensitive information.

The runner prints total elapsed seconds. The evidence report records the Playwright duration and each passing test's duration per browser. The config allocates up to 180 seconds for server startup and 180 seconds per scenario. Those are limits. The reporting unit tests ran in under one second on the Surface. A clean full-campaign runtime has yet to be measured.
