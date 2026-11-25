# Dependency readiness evidence (2026-11-25)

Revision: `04dc7014` (dev). Lock: the committed `package-lock.json`, unchanged since `808f491e`.

## Compatibility

The committed lock is the one that already carries the reviewed Next/Sentry/sharp/MCP/Zod upgrade and the compatible transitive refresh. On this lock:
- Full regression passed twice: 11,005 passed / 1 skipped in each pass, TS 0, production compilation pass. Runs: 45608335283 and 45655884013.
- The full acceptance campaign passed 160/160 twice in a row, with zero retries, on Chromium, mobile Safari (WebKit) and mobile Chrome. Runs: 45659277510 and 45669651633.
- The dev Test workflow passed. Run: 45683250330.

The manifest's "full compatibility and browser regression remain pending" no longer holds for this lock.

## Audit of the committed lock

`npm audit --omit=dev --package-lock-only`: 0 critical, 6 high, 20 moderate, 6 low. Dependabot alerts are disabled on the repository.

All 6 high entries come from two advisories, through two chains:

| Advisory | Vulnerable copy | Chain (audit entries) |
|---|---|---|
| GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4 (`@grpc/grpc-js` <1.13.6) | `@firebase/firestore/node_modules/@grpc/grpc-js` 1.9.16 | `@grpc/grpc-js` → `@firebase/firestore` → `@firebase/firestore-compat` → `firebase` |
| GHSA-mrhx-c7xc-m3w5 (`zod` <4.6.6) | `inngest/node_modules/zod` 3.25.76 | `zod` → `inngest` |

The app's own `zod` is 4.6.7, which is patched. The top-level `@grpc/grpc-js` is 1.14.7, which is patched; it is used by the OpenTelemetry OTLP gRPC exporter.

## Reachability

### gRPC through Firestore: not reachable

- The app never imports Firestore. The only Firebase use is `lib/auth/google-browser.ts`, a `'use client'` module. It dynamically imports `firebase/app` and `firebase/auth` only.
- In the lock, `@firebase/auth` and `@firebase/app` depend only on `@firebase/component`, `@firebase/logger`, `@firebase/util`, `idb` and `tslib`. Only `firebase` (umbrella) and `@firebase/firestore-compat` require `@firebase/firestore`.
- The Firestore browser build talks over WebChannel; `@grpc/grpc-js` is the Node transport.
- Both advisories concern a gRPC server: certificate authorization via `getAuthContext`, and handler error messages sent back in status messages. The app runs no gRPC server.
- The standalone runtime inventory of the compiled artifact (run 45655884013, `runtime-dependencies.json`, 114 external packages) contains no `firebase`, `@firebase/*` or `@grpc/*` entry.

### zod 3 inside Inngest: not reachable without the signing key

- There is no upstream fix: `inngest@latest` (4.27.0) still depends on `zod ^3.25.0`.
- Inngest is imported only from server code: `app/api/inngest/route.ts`, `lib/inngest/client.ts` and `lib/inngest/functions/*`. The client is `new Inngest({ id: 'xtimator' })`, with no `isDev` and no `skipSignatureValidation`.
- In `node_modules/inngest/components/InngestCommHandler.js` the signature is checked before any zod parsing:
  - The body is read with plain `JSON.parse` (around line 550). `validateSignature` starts at line 556.
  - No zod parse runs between that point and the POST 401 at lines 804–813. The GET path returns 401 at lines 1013–1023, and in-band sync returns 401 before its schema parse.
  - `validateSignature` fails without a signing key or a signature header in cloud mode (lines 1414–1425).
- The schemas on the request path are not constrained collections. `inBandSyncRequestBodySchema` is `{ url: string }`, and the op and error schemas are plain objects.
- Production check (read-only, 2026-11-25): unsigned `GET https://xtimator.com/api/inngest` returns **401**, and an unsigned POST also returns **401**. Production therefore runs in cloud mode with a signing key, because dev mode would skip validation and answer 200.
- Residual risk: an attacker holding the Inngest signing key. That key already grants full control of the job endpoint, so this advisory adds nothing material.

## Verdict and what stays open

Neither high-severity chain is reachable in production. The lock passed full compatibility and browser regression. What remains is an owner decision rather than missing evidence: accept these two documented residual advisories for launch, or ask for hygiene changes.

The hygiene changes on offer are:
- An `overrides` entry pinning Firestore's nested `@grpc/grpc-js` to 1.14.x. This is harmless, because Firestore is unused.
- Replacing the `firebase` umbrella with `@firebase/app` + `@firebase/auth`. This removes Firestore from the tree but touches the sign-in code.

Either one needs another lock regression and acceptance run. Moderate and low entries have not been triaged individually.

Keep `INNGEST_DEV` unset in production.
