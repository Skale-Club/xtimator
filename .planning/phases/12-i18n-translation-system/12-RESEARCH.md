# Phase 12: i18n Translation System - Research

**Researched:** 2026-04-24
**Domain:** Client-side i18n with React Context, static dictionary, AI-backed dynamic translation, Supabase DB cache
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `LanguageContext` stores current language in `localStorage` under key `language`, values `'en'` | `'pt'` | `'es'`. Default: `'en'`.
- **D-02:** `useTranslation()` hook exposes `t(text: string): string`. If language is `'en'` → returns `text` unchanged (zero overhead). If `'pt'` or `'es'` → resolves via priority chain: (1) in-memory session cache → (2) static `translations.ts` dictionary → (3) `/api/translate` API.
- **D-03:** `LanguageProvider` wraps the app in `app/layout.tsx` (root layout, wraps everything). Toggle only appears in authenticated app topbar — admin and estimate share page see no toggle and default to `'en'`.
- **D-04:** `/api/translate` route at `app/api/translate/route.ts`. Implementation: check `translations` DB table → if found return cached → if not call `getIntegrationKey('anthropic')` + Claude → save with `onConflictDoNothing()` → return `{ translations: { [source]: translated } }`.
- **D-05:** Requests to `/api/translate` are batched and debounced 50ms. Multiple `t()` calls on the same render fire a single batched request.
- **D-06:** `translations` DB table — migration `20260424000001_add_translations_table.sql`. Schema: `id BIGSERIAL PK, source_text TEXT NOT NULL, source_language TEXT NOT NULL DEFAULT 'en', target_language TEXT NOT NULL, translated_text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()`. Unique index on `(source_text, source_language, target_language)`.
- **D-07:** `TranslationLoadingOverlay` shown while first-session dynamic translations are fetching. Subsequent navigations to already-translated pages show text instantly (in-memory cache hit).
- **D-08:** Wrap common high-frequency UI strings only — target ~80 strings covering: all navbar items, buttons (Save, Cancel, Delete, Create, Edit, Submit, Back, Next), status labels (Active, Draft, Sent, Pending, Cancelled), form field labels, section headings (Dashboard, Clients, Projects, Estimates, Settings), empty state messages, error messages, and modal titles.
- **D-09:** Rare strings (admin panel content, legal copy, error stack traces, placeholder text) are NOT wrapped — they remain hardcoded EN and are explicitly excluded from i18n scope.
- **D-10:** The static `translations.ts` dictionary covers all ~80 wrapped strings for both PT-BR and ES. Goal: zero `/api/translate` API calls for a typical authenticated session flow.
- **D-11:** `LanguageToggle` placed in `components/app-shell/topbar.tsx` alongside the existing `ThemeToggle`. Cycles EN → PT → ES → EN on click. Displays current language code as a 2-letter badge.
- **D-12:** Toggle also added to `components/app-shell/bottom-nav.tsx` (mobile) for parity.
- **D-13:** Landing page (`app/page.tsx` and `components/landing/`) is explicitly OUT OF SCOPE.

### Claude's Discretion

- Exact Claude model and prompt for translation (use `claude-haiku-*` for low-latency, low-cost translation calls)
- In-memory cache implementation (Map vs WeakRef vs module-level object)
- How the 50ms debounce batch is assembled (setTimeout + accumulator pattern or a small utility)
- Whether `LanguageToggle` uses a `DropdownMenu` (showing all 3 options) or a cycle-on-click button
- RLS policy on `translations` table (platform-wide read, service-role write — no per-tenant isolation needed)

### Deferred Ideas (OUT OF SCOPE)

- Landing page translation (server component — defer to v1.3)
- Admin panel translation (EN-only acceptable for v1.2)
- `/estimate/*` share page translation (EN-only for v1.2)
- Per-user language preference in DB (localStorage covers v1.2)
- Language auto-detection from browser locale (manual toggle covers v1.2)
- Translation admin UI (view/edit cached translations — deferred to v2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| I18N-01 | User can switch the app language between EN, PT, and ES from a language toggle in the navbar | LanguageToggle component in topbar + bottom-nav; cycle pattern; 2-letter badge |
| I18N-02 | Selected language is persisted in `localStorage` under key `language` and restored on reload without flicker | SSR-safe hydration pattern: `useState` + `useEffect` mount guard (same as ThemeToggle `mounted` pattern) |
| I18N-03 | All user-visible text in authenticated app wrapped in `t()`; English strings returned unchanged | `useTranslation()` hook; EN fast-path returns text identity; ~80 string wrapping pass |
| I18N-04 | Static `translations.ts` provides immediate PT-BR and ES for common strings (no API call) | Static dictionary covering all ~80 strings; looked up before API fallback |
| I18N-05 | Strings not in static dict auto-translated by AI via `/api/translate`; batched 50ms debounce; saved with `onConflictDoNothing()` | setTimeout accumulator; `createServiceClient()` for writes; `getIntegrationKey('anthropic')` pattern |
| I18N-06 | Translated strings cached in-memory for browser session; no redundant API calls | Module-level `Map<string, string>` keyed by `${lang}:${source}`; checked before static dict and API |
| I18N-07 | `TranslationLoadingOverlay` shown during dynamic translation fetch | Loading state tracked in context; overlay component renders while `pendingCount > 0` |
| I18N-08 | `translations` DB table stores entries with unique index on `(source_text, source_language, target_language)` | `CREATE UNIQUE INDEX` in migration; `onConflictDoNothing()` in Supabase insert |
</phase_requirements>

---

## Summary

Phase 12 implements a client-side i18n system with a three-tier resolution chain: in-memory session cache, static dictionary, and AI-backed API with a DB cache. The architecture is fully pre-designed in SEED-001 and locked in CONTEXT.md — research validates the implementation patterns against existing codebase code, not alternative designs.

The codebase already has every building block needed. `ThemeToggle` is the direct analog for `LanguageToggle` (client component, `mounted` guard, context side-effects, `DropdownMenu` or cycle-click). `getIntegrationKey('anthropic')` in `lib/platform-config.ts` is the exact pattern for fetching the AI key in the translate route. The `createServiceClient()` function is the write client. The theme preference migration (`20260422000001_theme_preference.sql`) shows the exact file format for the new translations migration.

The key implementation risks are: (1) SSR hydration flicker from `localStorage` reads (mitigated by the `mounted` guard pattern already proven in `ThemeToggle`), (2) the `LanguageProvider` being an async server component boundary in `app/layout.tsx` (resolved by making `LanguageProvider` a `'use client'` component that reads `localStorage` on mount), and (3) the debounce batch accumulator race condition if requests resolve out of order (mitigated by keying the in-memory cache before dispatching).

**Primary recommendation:** Follow SEED-001 exactly. Use the `ThemeToggle` component as the structural template for `LanguageToggle`. Implement the debounce accumulator as a `setTimeout` + `Map<string, string[]>` pattern (sources pending per language). Use a module-level `Map` for in-memory cache (not WeakRef — strings are primitives). Use `claude-haiku-4-20250514` for translation calls.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Context API | Built-in (React 18) | `LanguageContext` + `LanguageProvider` | Zero deps, matches existing `ThemeProvider` pattern |
| `localStorage` | Browser native | Persist language selection | Matches D-01; no package overhead |
| `@anthropic-ai/sdk` | `^0.39.0` (installed) | `claude-haiku-*` translation API calls | Already wired; same SDK used by `generate-estimate` |
| `@supabase/supabase-js` | `^2.103.0` (installed) | `translations` DB table reads/writes | Already wired via `createServiceClient()` |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | Installed | Globe icon for `LanguageToggle` | Visual indicator; `Globe` or `Languages` icon available |
| shadcn/ui `DropdownMenu` | Installed | Optional: dropdown variant of `LanguageToggle` | If dropdown chosen over cycle-click |
| shadcn/ui `Button` | Installed | `LanguageToggle` trigger wrapper | Ghost/icon variant matching `ThemeToggle` |

**No new packages required.** All dependencies are already installed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom React Context | `next-intl`, `react-i18next` | External libs add SSR complexity incompatible with D-03 (client-side only for v1.2); also contradict CONTEXT.md locked decisions |
| Module-level Map cache | WeakRef | WeakRef requires object keys; strings are primitives — Map is the correct choice |
| `claude-haiku-4-20250514` | `claude-sonnet-4-20250514` | Haiku is 5-10x cheaper and faster for short string translation; sonnet is overkill |

---

## Architecture Patterns

### Recommended File Structure

```
lib/
├── i18n/
│   ├── language-context.tsx      # LanguageContext + LanguageProvider ('use client')
│   ├── use-translation.ts        # useTranslation() hook
│   └── translations.ts           # Static dictionary (~80 strings, PT + ES)
components/
└── app-shell/
    ├── language-toggle.tsx        # LanguageToggle component ('use client')
    └── translation-loading-overlay.tsx  # TranslationLoadingOverlay ('use client')
app/
└── api/
    └── translate/
        └── route.ts              # POST /api/translate
supabase/
└── migrations/
    └── 20260424000001_add_translations_table.sql
```

### Pattern 1: LanguageContext with SSR-safe localStorage hydration

The `mounted` guard from `ThemeToggle` prevents hydration mismatch from `localStorage` reads:

```typescript
// lib/i18n/language-context.tsx
'use client'

import { createContext, useContext, useState, useEffect } from 'react'

type Language = 'en' | 'pt' | 'es'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    // Runs on client only — reads localStorage after hydration
    const stored = localStorage.getItem('language') as Language | null
    if (stored === 'pt' || stored === 'es') {
      setLanguageState(stored)
    }
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
```

**Integration point:** `app/layout.tsx` line 36 — wrap `ThemeProvider` children:
```typescript
<ThemeProvider ...>
  <LanguageProvider>
    {children}
    <Toaster />
  </LanguageProvider>
</ThemeProvider>
```

### Pattern 2: useTranslation hook with debounced batch

```typescript
// lib/i18n/use-translation.ts
'use client'

import { useLanguage } from './language-context'
import { staticDict } from './translations'

// Module-level in-memory cache — persists for browser session
const memCache = new Map<string, string>()

// Batch accumulator
let batchTimer: ReturnType<typeof setTimeout> | null = null
const pendingBatch: Map<string, ((translated: string) => void)[]> = new Map()

async function flushBatch(targetLang: 'pt' | 'es') {
  const sources = Array.from(pendingBatch.keys())
  if (sources.length === 0) return

  const resolvers = new Map(pendingBatch)
  pendingBatch.clear()
  batchTimer = null

  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: sources, targetLanguage: targetLang }),
  })

  if (!res.ok) {
    // Fallback: return source text on error
    resolvers.forEach((cbs, src) => cbs.forEach(cb => cb(src)))
    return
  }

  const { translations } = await res.json() as { translations: Record<string, string> }

  resolvers.forEach((cbs, src) => {
    const translated = translations[src] ?? src
    const cacheKey = `${targetLang}:${src}`
    memCache.set(cacheKey, translated)
    cbs.forEach(cb => cb(translated))
  })
}

function resolveAsync(text: string, lang: 'pt' | 'es'): Promise<string> {
  return new Promise((resolve) => {
    const existing = pendingBatch.get(text)
    if (existing) {
      existing.push(resolve)
    } else {
      pendingBatch.set(text, [resolve])
    }

    if (batchTimer) clearTimeout(batchTimer)
    batchTimer = setTimeout(() => flushBatch(lang), 50)
  })
}

export function useTranslation() {
  const { language } = useLanguage()

  function t(text: string): string {
    if (language === 'en') return text

    const cacheKey = `${language}:${text}`

    // 1. In-memory cache
    const cached = memCache.get(cacheKey)
    if (cached) return cached

    // 2. Static dictionary
    const staticEntry = staticDict[language]?.[text]
    if (staticEntry) {
      memCache.set(cacheKey, staticEntry)
      return staticEntry
    }

    // 3. API (async — t() returns source text immediately, UI updates on resolve)
    resolveAsync(text, language).then((translated) => {
      // Trigger re-render via external state mechanism (see Pattern 3)
    })

    return text // Return source text while async resolves
  }

  return { t, language }
}
```

**Important:** `t()` is synchronous — it returns source text while async translation resolves, then triggers a re-render. This is a known pattern for lazy translation loading. The `TranslationLoadingOverlay` covers this UX gap.

### Pattern 3: Loading overlay state management

The overlay requires tracking pending async calls. The recommended approach is to add `pendingCount` to the context:

```typescript
// In LanguageContext: add loading state
const [pendingCount, setPendingCount] = useState(0)

// TranslationLoadingOverlay checks pendingCount > 0
// resolveAsync increments on queue, decrements on resolve
```

### Pattern 4: /api/translate route (follows generate-estimate pattern exactly)

```typescript
// app/api/translate/route.ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.texts || !body?.targetLanguage) {
    return NextResponse.json({ error: 'texts and targetLanguage required' }, { status: 400 })
  }

  const { texts, targetLanguage } = body as { texts: string[]; targetLanguage: 'pt' | 'es' }
  const svc = createServiceClient()

  // 1. Check DB cache for all texts in one query
  const { data: cached } = await svc
    .from('translations')
    .select('source_text, translated_text')
    .in('source_text', texts)
    .eq('source_language', 'en')
    .eq('target_language', targetLanguage)

  const found = new Map((cached ?? []).map(r => [r.source_text, r.translated_text]))
  const missing = texts.filter(t => !found.has(t))

  // 2. AI translate missing strings
  if (missing.length > 0) {
    const key = await getIntegrationKey('anthropic')
    if (!key) return NextResponse.json({ error: 'AI unavailable' }, { status: 503 })

    const anthropic = new Anthropic({ apiKey: key })
    const langLabel = targetLanguage === 'pt' ? 'Brazilian Portuguese (PT-BR)' : 'Spanish (ES)'

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Translate these UI strings from English to ${langLabel}. Return ONLY a JSON object mapping each source string to its translation. Preserve formatting. Source strings:\n${JSON.stringify(missing)}`
      }]
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    const aiMap = JSON.parse(raw) as Record<string, string>

    // 3. Save to DB with onConflict do nothing
    const rows = missing
      .filter(src => aiMap[src])
      .map(src => ({
        source_text: src,
        source_language: 'en',
        target_language: targetLanguage,
        translated_text: aiMap[src],
      }))

    if (rows.length > 0) {
      await svc.from('translations').insert(rows, { onConflict: 'source_text,source_language,target_language' })
    }

    missing.forEach(src => { if (aiMap[src]) found.set(src, aiMap[src]) })
  }

  return NextResponse.json({
    translations: Object.fromEntries(
      texts.map(src => [src, found.get(src) ?? src])
    )
  })
}
```

**Note:** `createServiceClient()` is used for writes (service role key). No auth check needed on `/api/translate` — translations are platform-wide, non-sensitive data. This differs from `generate-estimate` which validates user auth. The planner should decide whether to add auth check for rate-limiting protection.

### Pattern 5: LanguageToggle (cycle-click variant — recommended)

```typescript
// components/app-shell/language-toggle.tsx
'use client'

import { useLanguage } from '@/lib/i18n/language-context'
import { Button } from '@/components/ui/button'

const CYCLE: Array<'en' | 'pt' | 'es'> = ['en', 'pt', 'es']
const LABELS: Record<string, string> = { en: 'EN', pt: 'PT', es: 'ES' }

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  const next = () => {
    const idx = CYCLE.indexOf(language)
    setLanguage(CYCLE[(idx + 1) % CYCLE.length])
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={`Current language: ${language}. Click to change.`}
      className="cursor-pointer font-mono text-xs font-semibold"
    >
      {LABELS[language]}
    </Button>
  )
}
```

**Integration in topbar.tsx** (line 32 — add before `ThemeToggle`):
```typescript
<div className="flex items-center gap-1">
  <LanguageToggle />
  <ThemeToggle />
  ...
</div>
```

**Integration in bottom-nav.tsx** — add as a fixed icon separate from NAV_ITEMS, since bottom-nav renders map over `NAV_ITEMS` array. The toggle should render as a standalone button outside the map loop, positioned in the nav bar.

### Pattern 6: DB Migration format

```sql
-- supabase/migrations/20260424000001_add_translations_table.sql
-- Phase 12: Translation cache table for i18n system

CREATE TABLE translations (
  id BIGSERIAL PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX translations_source_target_unique
  ON translations (source_text, source_language, target_language);

COMMENT ON TABLE translations IS
  'Cache for AI-translated UI strings. Platform-wide, not tenant-scoped.';

-- RLS: allow anon/authenticated reads; service role handles writes via API route
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translations_public_read"
  ON translations FOR SELECT
  USING (true);
-- Writes are service-role only (no INSERT policy needed — service role bypasses RLS)
```

### Anti-Patterns to Avoid

- **Wrapping `LanguageProvider` as an async server component:** The root layout is async (fetches branding). `LanguageProvider` must be `'use client'` to read `localStorage` — it cannot be async. Keep it pure client component, nested inside the server layout.
- **Reading `localStorage` during SSR render:** Will cause hydration mismatch. Always guard with `useEffect` + `mounted` state (proven in `ThemeToggle`).
- **Using a single pending flag for overlay:** Multiple concurrent batches can interleave. Use a counter (`pendingCount`) not a boolean.
- **Calling `t()` outside React render:** The hook uses `useLanguage()` which uses `useContext()` — must be called in a component. Don't extract `t()` for use in server actions or utility functions.
- **Translating dynamic values:** Do not call `t('$123.45')` or `t(someVariableString)` — the static dict won't cover these and AI translation of money/code values is unreliable. Wrap only static UI label strings.
- **One API call per string:** The 50ms batch collapses concurrent `t()` calls into a single request. If the debounce is bypassed, a page with 20 untranslated strings will fire 20 API calls.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI key management | New env var or hardcoded key in translate route | `getIntegrationKey('anthropic')` from `lib/platform-config.ts` | Already handles AES-GCM decrypt, TTL cache, env-var fallback for dev |
| DB write client | Importing anon client for service-role writes | `createServiceClient()` from `lib/supabase/service.ts` | Service role bypasses RLS; anon client can't write translations table |
| DB read client in API route | New Supabase client factory | `createServiceClient()` for both reads and writes | API route has no cookie context; server client not applicable here |
| Toast notifications | Custom notification state | `sonner` `toast` (already wired, used by ThemeToggle) | Consistent with existing error patterns |
| Dropdown component | Custom dropdown | shadcn/ui `DropdownMenu` (if dropdown variant chosen) | Already used in topbar for user menu |

---

## Runtime State Inventory

Step 2.5: SKIPPED — This is a greenfield feature addition (new table, new components, new hook). No existing state to rename or migrate. The `language` localStorage key is new — no existing key with this name in the codebase.

**Verification:** Grep confirms no existing `localStorage.getItem('language')` or `language_preference` key in the codebase.

---

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@anthropic-ai/sdk` | `/api/translate` AI calls | Yes | `^0.39.0` | `getIntegrationKey` returns null → 503 response |
| `@supabase/supabase-js` | `translations` DB table | Yes | `^2.103.0` | None (required) |
| `supabase db push` CLI | Migration apply | Yes (used in prior phases) | Prior phases confirmed working | None |
| Node.js | Next.js runtime | Yes | Current (Next.js 16.2.3) | None |

**Missing dependencies with no fallback:** None.

**Note:** `claude-haiku-4-20250514` is the model ID to use. Verify this model ID is current — the existing codebase uses `claude-sonnet-4-20250514` and the Anthropic SDK version `^0.39.0` should support Haiku 4. If Haiku 4 model ID has changed, fall back to `claude-haiku-3-20240307` (confirmed available in SDK 0.39).

---

## Common Pitfalls

### Pitfall 1: Hydration Mismatch from localStorage Read

**What goes wrong:** `LanguageProvider` reads `localStorage` during server render → Next.js RSC pre-renders with `'en'`, browser renders with `'pt'` → React hydration warning, possible FOUC (flash of untranslated content).
**Why it happens:** `localStorage` is browser-only; server rendering has no access.
**How to avoid:** Initialize `useState` with `'en'` (server-safe default). In `useEffect` (client-only), read `localStorage` and call `setLanguageState`. The component re-renders once on mount with the correct persisted language.
**Warning signs:** React warning "Text content did not match" in console; visible flash of wrong language on load.
**Proven fix in codebase:** `ThemeToggle` uses identical pattern — `const [mounted, setMounted] = useState(false)` + `useEffect(() => setMounted(true), [])`.

### Pitfall 2: t() Called in Server Components

**What goes wrong:** Developer imports `useTranslation` in a server component → runtime error "useState is not available in Server Components".
**Why it happens:** `useTranslation` uses `useContext` which is client-side only.
**How to avoid:** All components using `t()` must be `'use client'`. Server components render EN strings directly (no translation needed per D-09).
**Warning signs:** Build error mentioning hooks in server components.

### Pitfall 3: Batching Race Condition (Multiple Languages)

**What goes wrong:** User switches from EN → PT, some PT strings are batching, then switches to ES before flush. The batch fires with `targetLanguage: 'pt'` but language context is now `'es'`.
**Why it happens:** The 50ms debounce accumulates strings for a target language; if language changes mid-debounce, the wrong translations are saved to cache.
**How to avoid:** Key the batch accumulator by language (`Map<lang, Map<source, resolvers>>`). Flush any pending batch for the previous language (or discard it) when `setLanguage` is called.
**Warning signs:** Wrong translations appearing after rapid language switching.

### Pitfall 4: LanguageToggle in bottom-nav Breaks NAV_ITEMS Map

**What goes wrong:** Developer tries to add `LanguageToggle` as a `NavItem` in `NAV_ITEMS` array → TypeScript error (NavItem expects `href`, not an onClick handler), or toggle renders incorrectly as a nav link.
**Why it happens:** `BottomNav` maps over `NAV_ITEMS` and renders each as a `<Link>` — toggle is a button, not a link.
**How to avoid:** Render `LanguageToggle` as a separate element outside the `NAV_ITEMS.map()` call in `BottomNav`. Add it at the end of the nav bar as a standalone button.

### Pitfall 5: onConflict Do Nothing Insert Syntax

**What goes wrong:** `supabase.from('translations').insert(rows)` without conflict handling → unique index violation throws 23505 PostgreSQL error on duplicate translation.
**Why it happens:** Race condition between two users triggering translation of the same string simultaneously.
**How to avoid:** Use `supabase.from('translations').insert(rows, { onConflict: 'source_text,source_language,target_language' })`. This maps to `ON CONFLICT DO NOTHING` in Supabase PostgREST.
**Warning signs:** 500 errors in `/api/translate` logs with "duplicate key value violates unique constraint".

### Pitfall 6: Claude Response Parsing for Translation

**What goes wrong:** Claude returns Markdown-wrapped JSON (` ```json\n{...}\n``` `) instead of raw JSON → `JSON.parse` throws → all translations fall back to source text.
**Why it happens:** Haiku/Sonnet models sometimes wrap JSON in markdown code blocks.
**How to avoid:** Strip markdown fences before parsing: `raw.replace(/^```json\n?/, '').replace(/\n?```$/, '')`. Alternatively, use Claude's tool_use with a strict schema to guarantee raw JSON.
**Warning signs:** All dynamic translations silently falling back to English.

---

## Code Examples

### Static Dictionary Structure

```typescript
// lib/i18n/translations.ts
type TranslationDict = Record<string, string>

export const staticDict: Record<'pt' | 'es', TranslationDict> = {
  pt: {
    // Navigation
    'Dashboard': 'Painel',
    'Clients': 'Clientes',
    'Projects': 'Projetos',
    'Estimates': 'Orçamentos',
    'Settings': 'Configurações',
    'New Project': 'Novo Projeto',
    // Buttons
    'Save': 'Salvar',
    'Cancel': 'Cancelar',
    'Delete': 'Excluir',
    'Create': 'Criar',
    'Edit': 'Editar',
    'Submit': 'Enviar',
    'Back': 'Voltar',
    'Next': 'Próximo',
    'Sign Out': 'Sair',
    // Status labels
    'Active': 'Ativo',
    'Draft': 'Rascunho',
    'Sent': 'Enviado',
    'Pending': 'Pendente',
    'Cancelled': 'Cancelado',
    // ... ~65 more entries
  },
  es: {
    'Dashboard': 'Panel',
    'Clients': 'Clientes',
    'Projects': 'Proyectos',
    'Estimates': 'Presupuestos',
    'Settings': 'Configuración',
    'New Project': 'Nuevo Proyecto',
    'Save': 'Guardar',
    'Cancel': 'Cancelar',
    'Delete': 'Eliminar',
    'Create': 'Crear',
    'Edit': 'Editar',
    'Submit': 'Enviar',
    'Back': 'Atrás',
    'Next': 'Siguiente',
    'Sign Out': 'Cerrar sesión',
    'Active': 'Activo',
    'Draft': 'Borrador',
    'Sent': 'Enviado',
    'Pending': 'Pendiente',
    'Cancelled': 'Cancelado',
    // ... ~65 more entries
  }
}
```

The planner should include a task to enumerate all ~80 strings by scanning the authenticated app components. The dictionary must be complete before shipping (D-10).

### Supabase onConflict insert syntax

```typescript
// Verified pattern for PostgreSQL unique index conflict handling
await svc
  .from('translations')
  .insert(rows, { onConflict: 'source_text,source_language,target_language' })
// No .throwOnError() — silent ignore on conflict is the desired behavior
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `i18next` / `react-i18next` full library | Custom React Context + static dict | No overhead for EN users; no bundle size from unused translation infrastructure |
| `next-intl` with server components | Client-side `'use client'` context | Deferred for v1.3 when SSR i18n is properly designed; client-side is correct for v1.2 scope |
| Per-user language in DB | `localStorage` only | Simplest v1.2 solution; DB persistence deferred |

---

## Open Questions

1. **Auth check on `/api/translate`**
   - What we know: `generate-estimate` validates auth; translations are non-sensitive, platform-wide data
   - What's unclear: Whether to add an auth check to prevent unauthenticated abuse of the AI translation endpoint
   - Recommendation: Add a lightweight auth check (`getClaims()`) to prevent rate-limit abuse, but do not require `companyId` — translations are shared across all tenants.

2. **`claude-haiku-4-20250514` model ID verification**
   - What we know: Codebase uses `claude-sonnet-4-20250514`; CONTEXT.md says use `claude-haiku-*`
   - What's unclear: Whether Haiku 4 has been released with model ID `claude-haiku-4-20250514`
   - Recommendation: Planner should verify current Haiku 4 model ID against Anthropic docs at implementation time. Fallback: `claude-haiku-3-20240307` is confirmed available.

3. **Bottom-nav LanguageToggle layout**
   - What we know: `BottomNav` maps `NAV_ITEMS` (4 items) in a `justify-around` flex row; adding a 5th element changes spacing
   - What's unclear: Whether to add toggle as a 5th item (changing spacing) or overlay it differently
   - Recommendation: Planner decides layout. Options: (a) add as 5th element in the `justify-around` row, (b) position absolutely at bottom-left or bottom-right corner, (c) nest inside the Settings dropdown if one exists on mobile.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + React Testing Library (jsdom) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/i18n/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| I18N-01 | LanguageToggle cycles EN→PT→ES→EN on click | unit | `npx vitest run tests/unit/components/language-toggle.test.tsx` | No — Wave 0 |
| I18N-02 | Language persists in localStorage; restored on mount | unit | `npx vitest run tests/unit/i18n/language-context.test.tsx` | No — Wave 0 |
| I18N-03 | `t('text')` returns text unchanged when language='en' | unit | `npx vitest run tests/unit/i18n/use-translation.test.ts` | No — Wave 0 |
| I18N-04 | `t('Save')` returns 'Salvar' (PT) and 'Guardar' (ES) from static dict without fetch | unit | `npx vitest run tests/unit/i18n/use-translation.test.ts` | No — Wave 0 |
| I18N-05 | `/api/translate` calls Claude for missing strings; saves to DB; returns translations | unit | `npx vitest run tests/unit/translate-route.test.ts` | No — Wave 0 |
| I18N-06 | Second call to `t('Save')` hits mem cache; no fetch fired | unit | `npx vitest run tests/unit/i18n/use-translation.test.ts` | No — Wave 0 |
| I18N-07 | `TranslationLoadingOverlay` renders when pendingCount > 0; hides when 0 | unit | `npx vitest run tests/unit/components/translation-loading-overlay.test.tsx` | No — Wave 0 |
| I18N-08 | Migration creates `translations` table with unique index | integration | manual verify via `supabase db push` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/i18n/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/i18n/language-context.test.tsx` — covers I18N-01, I18N-02
- [ ] `tests/unit/i18n/use-translation.test.ts` — covers I18N-03, I18N-04, I18N-06
- [ ] `tests/unit/components/language-toggle.test.tsx` — covers I18N-01 (toggle cycle behavior)
- [ ] `tests/unit/components/translation-loading-overlay.test.tsx` — covers I18N-07
- [ ] `tests/unit/translate-route.test.ts` — covers I18N-05

**Note:** Test pattern is well-established. `theme-toggle.test.tsx` is the exact structural template — same mocking approach (`vi.mock` for context), same jsdom render pattern, same async handling.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 12 |
|-----------|---------------------|
| Next.js 14+ App Router, TypeScript strict | All new files use strict TypeScript; no `any` except where explicitly cast |
| Tailwind CSS + shadcn/ui | `LanguageToggle` uses shadcn `Button` (ghost/icon variant); no custom CSS |
| Security: Service role key never exposed to browser | `createServiceClient()` only called in `app/api/translate/route.ts` (server); never in `'use client'` components |
| All AI calls server-side via API routes | Translation AI call is in `app/api/translate/route.ts` only; `useTranslation` hook calls `fetch('/api/translate')` — never calls Anthropic SDK directly |
| react-hook-form + zod for forms | No forms in this phase — not applicable |
| GSD workflow enforcement | All file changes through GSD execute-phase workflow |

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `components/app-shell/theme-toggle.tsx` — SSR-safe mounted pattern; DropdownMenu structure; direct structural template
- Existing codebase: `app/api/generate-estimate/route.ts` — `getIntegrationKey` + Anthropic SDK pattern; exact template for translate route
- Existing codebase: `lib/platform-config.ts` — `getIntegrationKey()` implementation; TTL cache; env-var fallback
- Existing codebase: `lib/supabase/service.ts` — `createServiceClient()` for API route DB access
- Existing codebase: `supabase/migrations/20260422000001_theme_preference.sql` — migration file format
- SEED-001: `.planning/seeds/SEED-001-i18n-dynamic-translation-ptbr.md` — pre-designed architecture specification
- 12-CONTEXT.md: All locked decisions (D-01 through D-13) — authoritative for this phase

### Secondary (MEDIUM confidence)

- React Context API (built-in, stable) — `createContext`, `useContext`, `useState`, `useEffect` patterns
- Supabase PostgREST `onConflict` option — documented behavior for `INSERT ... ON CONFLICT DO NOTHING`

### Tertiary (LOW confidence — needs implementation-time verification)

- `claude-haiku-4-20250514` model ID — CONTEXT.md says use haiku; specific model ID should be verified against Anthropic API docs at implementation time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed; no new dependencies
- Architecture: HIGH — fully pre-designed in SEED-001, locked in CONTEXT.md, all patterns verified in existing codebase
- Pitfalls: HIGH — hydration mismatch (ThemeToggle proven fix), batch race condition (analyzed from code structure), onConflict syntax (Supabase documented)

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable domain — React Context + localStorage + Supabase patterns are stable)
