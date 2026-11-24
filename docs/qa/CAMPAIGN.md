# Xtimator acceptance campaign

The campaign exercises Xtimator against its existing Supabase development project, using isolated synthetic tenants. It expands through explicit hypotheses and observed failures; the manifest defines the current required scenarios, browser matrix and separate launch capabilities. Added scenarios still need passing browser evidence. The [manifest](../../tests/qa/manifest.json) is the acceptance contract.

## Scope and evidence

Administrative evidence uses a console reporter before JSON/HTML/JUnit: it preserves result status, retries, duration and error/attachment counts while removing raw administrative errors, steps, annotations, output and attachments. The pinned Playwright runner disables automatic ARIA snapshots, and artifact upload excludes all automatic error-context files and previous reports even if reporting is interrupted. Non-admin failure traces remain available. Global application/worker logs are a separate stream; this is not a blanket claim that every log is sanitized.

Browser campaigns use `https://127.0.0.1:9650`. The runner requires OpenSSL,
generates a one-day loopback certificate under ignored `.bg-shell/qa/tls`,
and removes its key after Playwright stops. Keys never enter `qa-results`.
Chromium trusts only the run's certificate SPKI; WebKit and local API contexts
retain their local certificate exception, while Node uses the generated CA.
HTTPS terminates at the loopback front, which relays raw bytes to the compiled
standalone app on HTTP9652. The keyless Inngest dev server calls that same
loopback HTTP endpoint. No host keychain or global TLS verification setting
is changed. An ephemeral cookie-signing key belongs only to the isolated app
build/runtime. Secure cookies retain their behavior; providers remain synthetic.

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

Dispatch `Test` with `qa=true` on the feature branch or use the trusted dev/PR triggers. The standalone campaign refuses to start outside GitHub Actions. It requires dependencies, Playwright browsers, OpenSSL, Python with `pypdf`, and dedicated development credentials. Keep credentials outside tracked files. Browser profiles emulate viewports and engines; physical capture remains a separate gate.

The runner requires `XTIMATOR_QA_DEV=1`, `DATA_API_MODE=supabase`, `NEXT_PUBLIC_AUTH_MODE=owned`, the development Supabase URL in `NEXT_PUBLIC_SUPABASE_URL`, and credentials in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `XTIMATOR_DATA_JWT_SECRET`. When `DATA_API_UPSTREAM_URL` is set, it must point to the same development origin.

```sh
gh workflow run test.yml --ref feat/autonomous-launch-qa -f qa=true -f qa_max_failures=0
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

## Isolated Stripe TEST campaign

The existing `Test` workflow accepts `payment_sandbox=true` on an upstream
feature-branch manual dispatch. This runs six real Stripe TEST API/ledger
cases against the designated development database. `payment_browser=true`
adds a seventh case that completes the hosted subscription Checkout in
Chromium. Both inputs default to false. The payment job cannot run on main,
dev, tags, pushes, pull requests or forks.

Preflight requires the exact development origins, a test-mode key, the
expected Stripe account and zero enabled webhook endpoints. PostgreSQL uses
the committed public Supabase root CA with certificate verification enabled;
see [CA provenance](../../tests/fixtures/SUPABASE-CA.md). The browser receives
the verified test Checkout URL through stdin and an operating-system-only
environment. A CONNECT proxy and browser routing restrict destinations.
Browser traces, screenshots, videos and provider responses are not recorded.
A required security challenge fails the case without bypassing it.
Normal provider assets, wallet initialization scripts and hCaptcha resources
may load. The helper only enters the public test card; it does not select a
wallet, solve a challenge, replace CAPTCHA tokens or change provider settings.

The seventh case requires Stripe to report the session complete and paid,
then processes retrieved official invoice and Checkout events through the
application and checks its actual development ledger. Cleanup verifies
ownership before deleting the generated customer and company, cancelling
the generated subscription and archiving its tagged catalog. Historical
Stripe TEST objects remain as provider audit records. External notifications
and unrelated integrations are disabled. These cases do not exercise live
payments or delivery of signed callbacks to the deployed HTTP endpoint. The
API suite does invoke the actual Next.js webhook handler with an official
retrieved event and ephemeral receiver signatures. It checks missing, altered,
expired and unconfigured signatures before verifying inbox and ledger replay.

## Browser runner

The complete acceptance job runs on macOS15 so WebKit provides its native MediaRecorder implementation. Playwright1.59.1 explicitly disables ENABLE_MEDIA_RECORDER in its Linux GTK/WPE build patches ([upstream source](https://github.com/microsoft/playwright/blob/v1.59.1/browser_patches/webkit/patches/bootstrap.diff)). The observed Linux recording failure has recorderAvailable=false despite a live native synthetic MediaStream. Replacing MediaRecorder with a mock would not establish the required recording behavior. All three projects run in the same job and share one fresh report; the matrix is not assembled from older platform runs. The PDF reader uses a temporary Python environment; OpenSSL3 provides per-run TLS keys. Mobile profiles still emulate devices and cannot establish physical iPhone/Android capture.

## Hypothesis, evidence and retest

The expanded scenarios cover native capture with synthetic media/provider output, project/settings/price-book persistence, exhausted generation retries, microphone refusal, stale document signing, editor hydration, automated accessibility rules, client keyboard interaction, public/workspace screen rendering, rejection of forged provider callbacks and change-order approval/decline. A rendered screen does not prove all of its controls or states. A synthetic provider result does not establish live provider quality or delivery.

1. Record the user-visible behavior in the manifest and identify the pages it exercises. Write the expected UI, API or persisted result before changing the scenario.
2. Use the matching `[QA:ID]` title in the test. Assert the observable behavior and retain the smallest useful evidence, such as a screenshot, signed document or persisted-state check.
3. Read the matrix and capability results after the run. Compare the observed outcome with the expected one. Classify a failure using the report, then inspect the private local Playwright artifacts if needed.
4. Fix the cause in the app, fixture or test. Preserve the behavior asserted by the manifest and record what changed.
5. Rerun the failing case to verify the fix. Run the complete required matrix for release evidence and record the Git revision, tested environment, result and duration. Keep raw artifacts local unless reviewed for sensitive information.

Every journey also fails on uncaught browser exceptions, known fatal React console errors and failed same-origin scripts/stylesheets. Context-level listeners include new pages and popups. The attachment retains categories, resource types and counts without raw exception text or URLs; only explicit request cancellation is nonfatal. Handled API/provider failures remain available for negative-path assertions.

`npm run qa:loader` verifies fixture imports inside an actual Playwright worker without starting the app, opening a browser or using credentials. CI runs it after native infrastructure checks and before installing browsers. Cleanup implementations are shared CommonJS modules with native ESM CLI wrappers, so both runtimes retain the same ownership guards.

The runner builds and serves the standalone artifact behind local HTTPS. Its narrowed worker/provider configuration requires exact development data/auth settings and, for production-mode execution, an explicit CI flag and exact loopback public/worker origins. Ordinary deployments retain normal workers and provider lookup. Before browser journeys, prerequisites check both SDK introspection and the local executor's actual registered workers. Evidence contains counts and structural status only, rejecting unrelated workers or remote callbacks.

The runner records elapsed seconds and each case's duration per browser. Startup allows360seconds for compilation/bootstrap; ordinary scenarios allow180seconds, with explicit bounded overrides for multi-screen cases. The earlier development-server103-case baseline took43.3minutes (about46minutes with setup) and failed four cases; the initial native macOS27-case diagnostic took22minutes and failed nine. Neither establishes final compiled136-case acceptance.
