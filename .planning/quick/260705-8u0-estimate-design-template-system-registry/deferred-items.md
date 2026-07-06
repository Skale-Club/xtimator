# Deferred Items — 260705-8u0-estimate-design-template-system-registry

Items discovered during execution that are out of scope for the current task (pre-existing, not caused by this plan's changes) and therefore not auto-fixed per the deviation rules' scope boundary.

## From plan 02 (Modern PDF template)

- **File:** `app/api/estimates/[id]/pdf/route.ts:109` (line shifted by this plan's edits, originally line ~86)
- **Issue:** `eslint @typescript-eslint/no-explicit-any` — `renderToBuffer(element as any)` uses an explicit `any` cast.
- **Status:** Pre-existing before this plan (confirmed via `git diff HEAD`); the cast was already present in the file prior to Task 3's edits. Out of scope — not caused by the registry-keyed template selection added in this plan.
- **Action:** Not fixed. Left as-is per SCOPE BOUNDARY (only auto-fix issues directly caused by the current task's changes).
