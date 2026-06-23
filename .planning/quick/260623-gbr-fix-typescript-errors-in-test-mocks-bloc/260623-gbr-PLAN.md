---
phase: quick
plan: 260623-gbr
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/unit/notifications/account-emails.test.ts
  - tests/unit/xphere-client.test.ts
autonomous: true
requirements: [GBR-01, GBR-02]
must_haves:
  truths:
    - "npx tsc --noEmit exits with code 0 (no TS errors in test mock files)"
    - "npx vitest run tests/unit/notifications/account-emails.test.ts exits green"
    - "npx vitest run tests/unit/xphere-client.test.ts exits green"
  artifacts:
    - path: "tests/unit/notifications/account-emails.test.ts"
      provides: "Branding mock with all required fields including the 4 nullable additions"
    - path: "tests/unit/xphere-client.test.ts"
      provides: "XphereSyncPayload opportunity with required pipeline field"
  key_links:
    - from: "tests/unit/notifications/account-emails.test.ts"
      to: "lib/platform-config.ts Branding type"
      via: "vi.mock('@/lib/platform-config') + vi.mocked(getBranding).mockResolvedValue()"
      pattern: "metaDescription.*null"
    - from: "tests/unit/xphere-client.test.ts"
      to: "lib/integrations/xphere/types.ts XphereSyncPayload"
      via: "makePayload() opportunity object"
      pattern: "pipeline:.*string"
---

<objective>
Fix two TypeScript errors in test mock files that are blocking the Docker build.

Purpose: The CI gate (`npx tsc --noEmit -p tsconfig.ci.json`) and Docker build fail because test mocks return objects that no longer satisfy the fully-typed interfaces they are supposed to match. Both fixes are additive-only — no production code is touched.

Output: Both test files compile cleanly; all existing test assertions continue to pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

<!-- Key type contracts the executor needs — no codebase exploration required -->
<interfaces>
From lib/platform-config.ts:
```typescript
export type Branding = {
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  emailFromName: string | null
  siteTitle: string | null
  metaDescription: string | null   // ADDED — was missing from all mocks
  ogImageUrl: string | null        // ADDED — was missing from all mocks
  canonicalBaseUrl: string | null  // ADDED — was missing from all mocks
  faviconUrl: string | null        // ADDED — was missing from all mocks
  landingContent: LandingContent
}
```

From lib/integrations/xphere/types.ts:
```typescript
// XphereSyncPayload.opportunity (all fields required when the key is present):
opportunity?: {
  stage: string
  status: 'open' | 'won' | 'lost'
  value: number
  title: string
  pipeline: string   // ADDED in commit a78848eb — was missing from makePayload()
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing Branding fields to account-emails.test.ts mocks</name>
  <files>tests/unit/notifications/account-emails.test.ts</files>
  <action>
Three locations in this file return a `Branding`-shaped object. All three are missing
`metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl` (all `string | null`).
Add the four fields set to `null` in every location:

LOCATION 1 — top-level `vi.mock('@/lib/platform-config', ...)` at lines 4-13.
The `getBranding` mock factory currently returns:
```typescript
{
  appName: 'Xtimator',
  logoUrl: 'https://example.com/logo.png',
  primaryColor: '#111111',
  emailFromName: null,
  siteTitle: null,
}
```
It is also missing `landingContent`. Add all five missing fields:
```typescript
{
  appName: 'Xtimator',
  logoUrl: 'https://example.com/logo.png',
  primaryColor: '#111111',
  emailFromName: null,
  siteTitle: null,
  metaDescription: null,
  ogImageUrl: null,
  canonicalBaseUrl: null,
  faviconUrl: null,
  landingContent: {} as never,
}
```

LOCATION 2 — `beforeEach` inside `describe('sendWelcomeEmail', ...)` (approx line 84-91).
Already has `landingContent: {} as never`. Add only the four missing fields:
```typescript
  metaDescription: null,
  ogImageUrl: null,
  canonicalBaseUrl: null,
  faviconUrl: null,
```
(Insert after `siteTitle: null,`, before `landingContent`.)

LOCATION 3 — inline override inside `it('falls back to text name when logo URL is null', ...)` (approx line 172-179).
Already has `landingContent: {} as never`. Add the same four fields after `siteTitle: null,`.

LOCATION 4 — `beforeEach` inside `describe('sendProfileUpdatedEmail', ...)` (approx line 219-226).
Already has `landingContent: {} as never`. Add the four fields after `siteTitle: null,`.

Do NOT change any assertion logic, import order, or mock structure beyond adding these fields.
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && npx tsc --noEmit --project tsconfig.json 2>&1 | grep "account-emails" || echo "NO_ERRORS_IN_FILE"</automated>
  </verify>
  <done>
`npx tsc --noEmit` produces zero errors referencing account-emails.test.ts.
`npx vitest run tests/unit/notifications/account-emails.test.ts` exits 0 with all tests passing (no new failures).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add missing pipeline field to xphere-client.test.ts opportunity mock</name>
  <files>tests/unit/xphere-client.test.ts</files>
  <action>
In `makePayload()` (lines 14-37), the `opportunity` object is missing the required
`pipeline: string` field added in commit `a78848eb`. Add it as the last property
of the `opportunity` object:

Before:
```typescript
    opportunity: {
      stage: 'Active — Pro',
      status: 'won',
      value: 0,
      title: 'Acme Landscaping — Subscription',
    },
```

After:
```typescript
    opportunity: {
      stage: 'Active — Pro',
      status: 'won',
      value: 0,
      title: 'Acme Landscaping — Subscription',
      pipeline: 'Xtimator Lifecycle',
    },
```

Do NOT change any test assertions, imports, or mock structure beyond this one field addition.
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && npx tsc --noEmit --project tsconfig.json 2>&1 | grep "xphere-client" || echo "NO_ERRORS_IN_FILE"</automated>
  </verify>
  <done>
`npx tsc --noEmit` produces zero errors referencing xphere-client.test.ts.
`npx vitest run tests/unit/xphere-client.test.ts` exits 0 with all 4 tests passing.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test-only | Both files are test mocks; no production data path is touched |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-GBR-01 | Tampering | test mock data | accept | Mocks are test-only; no runtime data path; gitleaks pre-commit hook guards secrets |
</threat_model>

<verification>
After both tasks complete, run the full scope check:

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "account-emails|xphere-client" || echo "Both files clean"
npx vitest run tests/unit/notifications/account-emails.test.ts tests/unit/xphere-client.test.ts
```

Both commands must exit 0 with no TypeScript errors and all tests green.
</verification>

<success_criteria>
- Zero TypeScript errors in `tests/unit/notifications/account-emails.test.ts`
- Zero TypeScript errors in `tests/unit/xphere-client.test.ts`
- All `account-emails.test.ts` tests pass (diffProfileFields + sendWelcomeEmail + sendProfileUpdatedEmail suites)
- All 4 `xphere-client.test.ts` tests pass (unconfigured / success / non-2xx / network error)
- No production source files modified
</success_criteria>

<output>
After completion, create `.planning/quick/260623-gbr-fix-typescript-errors-in-test-mocks-bloc/260623-gbr-SUMMARY.md`
</output>
