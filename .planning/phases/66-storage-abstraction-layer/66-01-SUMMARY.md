---
phase: 66-storage-abstraction-layer
plan: 01
subsystem: storage
tags: [storage, abstraction, hetzner-readiness, tdd]
requires: []
provides:
  - lib/storage/index.ts (StorageProvider interface + createStorage factory)
  - lib/storage/supabase-provider.ts (createSupabaseStorageProvider)
  - lib/storage/keys.ts (buildStorageKey + BuildStorageKeyArgs)
  - tests/unit/storage/storage-provider.contract.test.ts
  - tests/unit/storage/supabase-provider.test.ts
  - tests/unit/storage/keys.test.ts
affects: []  # zero behavior change to existing call sites — Plan 02 migrates them
tech-stack:
  added: []
  patterns:
    - "Factory-per-call-site (not singleton): createStorage(client) wraps any SupabaseClient — caller owns auth context"
    - "Wave 0 RED contract tests lock interface shape before any consumer migrates (Nyquist gate)"
    - "Thin adapter pattern: every provider method delegates to client.storage.from(bucket).{op}"
key-files:
  created:
    - lib/storage/index.ts
    - lib/storage/supabase-provider.ts
    - lib/storage/keys.ts
    - tests/unit/storage/storage-provider.contract.test.ts
    - tests/unit/storage/supabase-provider.test.ts
    - tests/unit/storage/keys.test.ts
    - .planning/phases/66-storage-abstraction-layer/deferred-items.md
  modified: []
decisions:
  - "No singleton storage export — each call site instantiates createStorage(client) with the right auth-scoped Supabase client"
  - "getSignedUrl(bucket, path, expiresInSeconds) — third arg REQUIRED (no implicit default that hides expiry)"
  - "getPublicUrl kept synchronous (matches Supabase semantics) so logo and branding code paths don't need refactoring"
  - "delete accepts a single path; provider wraps it as [path] for Supabase's batch-only remove() — preserves a clean caller API"
  - "buildStorageKey sanitization mirrors lib/whatsapp/pdf-delivery.ts buildPdfFilename (collapse whitespace → hyphens, strip non-[a-zA-Z0-9._-])"
metrics:
  duration: 7m
  completed: 2026-05-15
  commits: 3
  test_files: 3
  tests_passing: 30
  files_created: 7
---

# Phase 66 Plan 01: Storage Provider Foundation — Summary

One-liner: shipped `lib/storage/` foundation — `StorageProvider` interface, `createSupabaseStorageProvider` thin adapter, and `buildStorageKey` convention helper — locked by 30 Wave 0 contract tests so Plan 02 can migrate every existing `supabase.storage.from(...)` call site to a single abstraction with zero shape negotiation.

## What shipped

### Public API (Plan 02 will import this)

```typescript
// lib/storage/index.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type StorageBody = Buffer | Blob | ArrayBuffer | Uint8Array | File

export interface UploadOptions {
  contentType?: string
  upsert?: boolean
}

export interface ListedObject {
  name: string
  size?: number
  updatedAt?: string
}

export interface StorageProvider {
  upload(bucket: string, path: string, body: StorageBody, opts?: UploadOptions): Promise<{ path: string }>
  download(bucket: string, path: string): Promise<Blob>
  getSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>  // expiresInSeconds REQUIRED
  getPublicUrl(bucket: string, path: string): string                                       // sync, Supabase semantics
  delete(bucket: string, path: string): Promise<void>
  list(bucket: string, prefix?: string): Promise<ListedObject[]>
}

export function createStorage(client: SupabaseClient): StorageProvider
export { buildStorageKey } from './keys'
export type { BuildStorageKeyArgs } from './keys'
```

```typescript
// lib/storage/keys.ts
export interface BuildStorageKeyArgs {
  companyId: string
  type: string             // e.g. 'photos', 'audio', 'whatsapp-pdf', 'logo', 'refine-photos'
  filename: string
  timestamp?: number       // optional injection for deterministic tests
}

export function buildStorageKey(args: BuildStorageKeyArgs): string
// → `${companyId}/${type}/${timestamp}-${safeFilename}`
```

### Plan 02 import + instantiation idiom

```typescript
// Server (route handler / server action)
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage, buildStorageKey } from '@/lib/storage'

const supabase = requireServiceClient()
const storage = createStorage(supabase)
const key = buildStorageKey({ companyId, type: 'whatsapp-pdf', filename: `${estimateId}.pdf` })
await storage.upload('pdfs', key, Buffer.from(pdfBuffer), { contentType: 'application/pdf' })
const url = await storage.getSignedUrl('pdfs', key, 86400)

// Browser (client component)
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'

const supabase = createBrowserClient()
const storage = createStorage(supabase)
await storage.upload('photos', key, file, { contentType: file.type })
```

## Why no singleton?

A singleton `storage` export would force a fixed client (server, browser, or service-role) at module load time. Every caller already has the right Supabase client in hand for its auth context — `createStorage(supabase)` keeps the auth boundary explicit and per-call-site, exactly mirroring the current direct-call ergonomics. The Hetzner swap remains a 1-line change inside `createStorage` (or a new `createStorage()` flavor selected by env flag).

## Why getSignedUrl requires expiresInSeconds explicitly

STORAGE-04 forbids implicit defaults that hide expiry behavior. Today's call sites pass `86400` (24h) for WhatsApp PDFs and `3600` for refinement audio — making them named is a TypeScript-level guarantee that no future caller silently leaks a long-lived URL by forgetting the second arg.

## Test inventory

| File | Tests | Status |
|------|-------|--------|
| `tests/unit/storage/storage-provider.contract.test.ts` | 8 | GREEN |
| `tests/unit/storage/keys.test.ts` | 6 | GREEN |
| `tests/unit/storage/supabase-provider.test.ts` | 16 | GREEN |
| **Total** | **30** | **GREEN** |

`npm test -- tests/unit/storage/` exits 0.

## Untouched call sites (Plan 02 territory)

Per the plan's success criterion #5, this plan made ZERO changes to existing storage call sites. The eight files enumerated in the planning context are still using `supabase.storage.from(...)` directly:

- `lib/whatsapp/pdf-delivery.ts` (upload + createSignedUrl)
- `lib/whatsapp/handler.ts` (download)
- `lib/actions/settings.ts` (upload + getPublicUrl + remove)
- `app/admin/branding/actions.ts` (upload + getPublicUrl)
- `app/admin/branding/page.tsx` (getPublicUrl)
- `app/api/estimates/[id]/refine/voice/route.ts` (download + remove)
- `components/capture/capture-recorder.tsx` (upload)
- `components/clients/client-sheet.tsx` (upload + getPublicUrl)

`git diff --stat HEAD~3 -- lib/ app/ components/ ':!lib/storage/'` returns no output. Verified.

## Requirements satisfied

- **STORAGE-01** — `StorageProvider` interface exported from `@/lib/storage` with all 6 methods
- **STORAGE-02** — `createSupabaseStorageProvider` adapts `@supabase/supabase-js` to the interface; tested with mocked client
- **STORAGE-04** — `buildStorageKey` enforces `{companyId}/{type}/{timestamp}-{filename}`; consumer migration enforced by Plan 02

## Deviations from Plan

**Minor — getPublicUrl was added to the interface as planned.** The plan's Action section flagged that `lib/actions/settings.ts`, `app/admin/branding/actions.ts`, and `components/clients/client-sheet.tsx` use `getPublicUrl` for public-bucket logos. The interface now includes it as a synchronous method (matching Supabase semantics) so Plan 02 doesn't need to keep a parallel direct-call escape hatch.

**Minor — index.ts wires createStorage in Task 2 (not Task 3 as a follow-up edit).** The plan suggested updating `index.ts` in Task 3 to add the factory. Doing it in Task 2 felt cleaner because the factory + interface form a single conceptual unit; the supabase-provider import resolves once Task 3 lands. Net result is identical (3 commits, same final state, all tests GREEN).

**No automated fixes triggered (Rules 1-3 not exercised).** The plan was self-contained and well-specified; no bugs surfaced, no missing critical functionality, no blocking issues outside the plan's scope.

## Deferred Issues (out of scope)

Pre-existing tsc errors on main that are NOT introduced by Phase 66 are documented in `.planning/phases/66-storage-abstraction-layer/deferred-items.md`:
- 4 baseline tsc errors in `tests/unit/api/{analyze-photos,generate-estimate}-quota.test.ts` and `tests/unit/whatsapp/pdf-delivery.test.ts`. Recommended to fix as a small follow-up plan, or piggy-back on Plan 02 (which re-touches `pdf-delivery.ts`).

## Commits

| Commit | Type | Message |
|--------|------|---------|
| `75b144a` | test | test(66-01): add Wave 0 RED contract tests for StorageProvider + buildStorageKey |
| `f00d5d2` | feat | feat(66-01): add StorageProvider interface + buildStorageKey helper |
| `88429e0` | feat | feat(66-01): add Supabase StorageProvider implementation |

## Self-Check: PASSED

- All 7 created files present on disk (verified with `[ -f ... ]`)
- All 3 commits present in `git log` (verified with `git log --oneline | grep`)
- All 30 tests pass (`npx vitest run tests/unit/storage/`)
- Zero changes to call sites outside `lib/storage/` and `tests/unit/storage/` (verified with `git diff --stat HEAD~3`)
- No new tsc errors introduced (baseline diff confirmed via `git stash` + `tsc --noEmit`)
