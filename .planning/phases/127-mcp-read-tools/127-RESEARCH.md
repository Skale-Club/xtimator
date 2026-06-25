# Phase 127: MCP Read Tools — Knowledge + Query over the Neutral Core - Research

**Researched:** 2026-06-25
**Domain:** MCP tool binding layer (Model Context Protocol) over the v4.9 channel-neutral `lib/agent-tools/` capabilities, on the existing v4.1 `/api/mcp` Streamable HTTP server
**Confidence:** HIGH (entirely codebase-internal; every recommendation mirrors an existing, tested pattern in this repo)

## Summary

Phase 127 adds **6 read-only MCP tools** to the *already-built* v4.1 MCP server: `ask_knowledge` (MKB-01) plus 5 query tools `find_client` / `get_latest_estimate` / `get_project_status` / `list_recent_estimates` / `list_services` (MQRY-01). Each is a **thin closure** over a neutral `lib/agent-tools/` function — the same functions the v4.9 web chat already binds in `lib/chat/tools.ts`. There is **no new subsystem, no re-extraction, no schema change, no new dependency**. The work is a near-mechanical mirror of the existing `lib/mcp/tools/read.ts` (the 4 read tools) and `lib/chat/tools.ts` (the same neutral binding from the chat channel).

The single hardest constraint is **MSEC-01** (`companyId` is resolved from the OAuth token → `auth.company_id`, NEVER a tool input field) — but this invariant is *already structural* in the existing read tools and the neutral functions take `companyId` as a trusted positional/closure arg, so the new tools inherit it by construction. **MSEC-02** (`readOnlyHint: true`) is a copy of the existing `READ_ONLY_ANNOTATIONS` constant.

**Primary recommendation:** Add a new builder file `lib/mcp/tools/knowledge-query.ts` exporting `buildKnowledgeQueryTools(auth)` that returns 6 `{ definition, handler }` entries (mirroring `buildReadTools`), wire it into `buildAllTools` in `lib/mcp/tools/registry.ts`, and update the **3 hardcoded count assertions** in `tests/unit/mcp-tool-registry.test.ts` (4→? read, 6→12 total). Do NOT touch `lib/agent-tools/` (import only). The 5 query tools each wrap a neutral data-read passing `(auth.company_id, requireServiceClient(), name?)`; `ask_knowledge` resolves the company's `industries[]` via a service-client `companies` read (exactly like `app/api/chat/route.ts` and `lib/whatsapp/intent-router.ts`), then calls `askKnowledge(question, { industries, companyId, language })`.

## Standard Stack

No new packages. Everything is already installed and in use by the v4.1 MCP server and the v4.9 chat channel.

### Core (already present — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP `Server`, `Tool` annotations, `CallToolRequestSchema` / `ListToolsRequestSchema`, `McpError` | The v4.1 server is built on it; tool definitions + `annotations` shape consumed by Claude.ai's permission UI |
| `zod` | ^4.3.6 | Per-handler input validation (`safeParse`) | The existing read/write tools parse args with zod inside the handler |
| `@supabase/supabase-js` | (in tree) | `SupabaseClient` type for the neutral data-reads; `requireServiceClient()` returns it | The neutral query functions take a `SupabaseClient` positional arg |

### Supporting (internal modules — import, do not modify)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `@/lib/agent-tools` (barrel) | The 6 neutral capabilities: `askKnowledge`, `findClientByName`, `getLatestEstimateForClient`, `getProjectStatus`, `listRecentEstimates`, `listServices` (also `findServiceByName` — see Open Question 1) | Each new MCP tool wraps exactly one. Import from the barrel `@/lib/agent-tools`, matching `lib/chat/tools.ts` |
| `@/lib/mcp/tools/registry` | `ToolDefinitionEntry`, `ToolResult`, `ToolDefinition` types + `buildAllTools` concatenation point | New builder returns `ToolDefinitionEntry[]`; wire it into `buildAllTools` |
| `@/lib/mcp/scope` (`requireScope`) | `mcp:read` scope gate | Every read handler gates on `mcp:read` first (mirror `ensureScope`) |
| `@/lib/supabase/service` (`requireServiceClient`) | Service-role client scoped at query layer by `.eq('company_id', …)` | The neutral data-reads need a service client; `ask_knowledge` needs it to read `companies.industries` |
| `@/lib/mcp/errors` (`invalidInput`, `insufficientScope`) | Typed `McpError` throws with `{ kind }` discriminator | Input-validation + scope-gate failures |
| `@/lib/mcp/auth` (`McpAuthContext`) | `{ client_id, user_id, company_id, scope }` — the trusted tenant | `auth.company_id` is the trusted companyId for every tool |

**Installation:** None. `npm install` not required.

**Version verification:** Versions read from `package.json` (verified 2026-06-25): `@modelcontextprotocol/sdk@^1.29.0`, `zod@^4.3.6`, `ai@^6.0.209`. No registry lookup needed — no new deps and the binding is internal.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New file `lib/mcp/tools/knowledge-query.ts` | Append the 6 tools into the existing `read.ts` | `read.ts` is plain DB-query read tools (keyset pagination, cursors). The new tools are *capability bindings* (no pagination, return a single text string from the neutral fn). Keeping them in a separate builder keeps `read.ts` byte-stable (its tests stay green untouched) and matches the `read.ts` / `write.ts` split convention. **Recommend the separate file.** |
| Resolve `industries[]` once and pass to all tools | Resolve it lazily inside the `ask_knowledge` handler only | Only `ask_knowledge` needs `industries`; the 5 query tools don't. Resolve it **inside the `ask_knowledge` handler** (lazy), exactly like `intent-router.ts`'s `dispatchKnowledge`. |

## Architecture Patterns

### Recommended file layout (additive only)
```
lib/mcp/tools/
├── registry.ts          # MODIFY: add buildKnowledgeQueryTools to buildAllTools
├── read.ts              # UNTOUCHED (4 DB read tools)
├── write.ts             # UNTOUCHED (create_estimate, check_job_status)
└── knowledge-query.ts   # NEW: buildKnowledgeQueryTools(auth) → 6 entries
tests/unit/
├── mcp-tool-registry.test.ts   # MODIFY: update hardcoded counts (6→12) + name list
└── mcp-knowledge-query-tools.test.ts  # NEW: per-tool company-scope + annotations + T-lrf-01 schema-walk
```

### Pattern 1: The MCP tool entry shape (the EXACT shape to mirror)
**What:** Each tool is a `{ definition, handler }` pair (`ToolDefinitionEntry`). The `definition` is advertised via `tools/list`; the `handler` is dispatched by name via `tools/call`. The handler is a closure over `auth`.
**When to use:** All 6 new tools.
**Example (the existing read-tool entry — the template):**
```typescript
// Source: lib/mcp/tools/read.ts (buildReadTools) + lib/mcp/tools/registry.ts (ToolDefinitionEntry)
export function buildReadTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    {
      definition: TOOL_DEFINITIONS[0]!,        // { name, description, inputSchema, annotations }
      handler: async (args) => {
        ensureScope(auth, 'mcp:read')          // gate FIRST — throws insufficientScope
        return handleListEstimates(auth, args) // parse args (zod) → query → jsonContent
      },
    },
    // …
  ]
}
```

The `ToolDefinition` shape (from `registry.ts`):
```typescript
interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>   // JSON-Schema object literal
  annotations: ToolAnnotations           // { readOnlyHint, destructiveHint, idempotentHint, openWorldHint, title }
}
```

### Pattern 2: Annotations constant (MSEC-02 — copy verbatim)
**What:** All 6 new tools carry the identical read-only annotation tier already defined in `read.ts`.
**Example:**
```typescript
// Source: lib/mcp/tools/read.ts (READ_ONLY_ANNOTATIONS) — copy this constant
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const
// each definition: annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Find client' }
```
Claude.ai auto-groups every tool carrying `readOnlyHint: true` under "Read-only tools (N) — Always allow" (the SEED-030 locked decision). No custom UI work.

### Pattern 3: The 5 query tools — thin neutral binding (MQRY-01)
**What:** Each tool's `inputSchema` is the neutral data-read's LLM input only (`{ name }` for the name-takers, `{}` for the listers). The handler passes the **trusted** `auth.company_id` + `requireServiceClient()` as the leading positional args — these are NEVER schema fields.
**Example (mirrors `lib/chat/tools.ts` exactly, translated to the MCP entry shape):**
```typescript
// Source pattern: lib/chat/tools.ts (buildChatTools) + lib/mcp/tools/read.ts (handler shape)
// neutral signatures (lib/agent-tools/query-company-data.ts):
//   findClientByName(companyId, supabase, name) -> string
//   getLatestEstimateForClient(companyId, supabase, name) -> string
//   getProjectStatus(companyId, supabase, name) -> string
//   listRecentEstimates(companyId, supabase) -> string
//   listServices(companyId, supabase) -> string

const findClientInput = z.object({ name: z.string().min(1) })

async function handleFindClient(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { name } = parseInput(findClientInput, args)
  const supabase = requireServiceClient()
  const text = await findClientByName(auth.company_id, supabase, name)  // companyId TRUSTED
  return { content: [{ type: 'text', text }] }   // neutral fn returns a plain string
}
```
> Note: the neutral query fns return a **plain string** (not `{ items, nextCursor }`), so the MCP result is `{ content: [{ type: 'text', text }] }` — NOT `JSON.stringify`-wrapped. Do not reuse `read.ts`'s `jsonContent` for the query tools; wrap the string directly. (`jsonContent` is fine if you prefer, but the string is already human-readable — emit it as-is to match WhatsApp/chat byte-output parity.)

### Pattern 4: ask_knowledge — resolve industries[] then call the neutral fn (MKB-01)
**What:** `ask_knowledge`'s only LLM input is `{ question }`. The handler resolves the company's `industries[]` (+ optional reply language) from the `companies` row via the service client — the **exact** read done by `app/api/chat/route.ts` and `lib/whatsapp/intent-router.ts` — then calls the neutral `askKnowledge`.
**Example:**
```typescript
// Source: app/api/chat/route.ts (the industries read) + lib/agent-tools/ask-knowledge.ts (askKnowledge)
const askKnowledgeInput = z.object({ question: z.string().min(1) })

async function handleAskKnowledge(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { question } = parseInput(askKnowledgeInput, args)
  const supabase = requireServiceClient()
  const { data: company } = await supabase
    .from('companies')
    .select('industries, default_estimate_language')
    .eq('id', auth.company_id)        // TRUSTED tenant; NEVER from input
    .maybeSingle()
  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)?.default_estimate_language
  const language = lang === 'en' || lang === 'pt' || lang === 'es' ? lang : undefined

  const text = await askKnowledge(question, { industries, companyId: auth.company_id, language })
  return { content: [{ type: 'text', text }] }
}
```
`askKnowledge` **never throws** (returns a FALLBACK string on KB/model outage) — so `ask_knowledge` cannot crash a tool call. T-lrf-01 holds: `industries` + `companyId` are caller-supplied from the trusted tenant, never derived from the untrusted question text.

### Pattern 5: Scope gate (mirror `ensureScope`)
Every handler gates on `mcp:read` BEFORE doing work, throwing `insufficientScope('mcp:read')`:
```typescript
function ensureScope(auth: McpAuthContext, scope: 'mcp:read'): void {
  const check = requireScope(auth, scope)
  if (!check.ok) throw insufficientScope(scope)
}
```
(Or import `ensureReadScope` already re-exported from `read.ts`.)

### Anti-Patterns to Avoid
- **Adding `companyId`/`company_id`/`tenant`/`tenantId` to any `inputSchema`** — violates MSEC-01/T-lrf-01. The LLM must never choose the tenant. A test walks every new tool's schema to assert these keys are absent.
- **Re-implementing the data reads in the MCP layer** — violates the scope fence + MPAR-01. Import the neutral fns; do not re-query `clients`/`estimates`/`projects`/`company_price_book` inside the MCP handler. (The only direct DB read allowed is `ask_knowledge`'s `companies.industries` lookup, which is the trusted-scope resolution, not a capability re-implementation — and even that mirrors chat/whatsapp verbatim.)
- **Editing `lib/agent-tools/`** — the neutrality gate (`tests/unit/agent-tools/neutrality.test.ts`) forbids channel imports; MCP must not leak into the neutral core. Import only.
- **Touching `read.ts` / `write.ts`** — keep them byte-stable so their existing test suites stay green (MPAR-01 non-destructive). Put the new tools in a new file.
- **Reusing keyset pagination** — the neutral query fns already cap their own results (e.g. `listServices` caps at 25, `listRecentEstimates` at 5). No cursor/`limit` input. Don't bolt pagination onto string-returning capability tools.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Company data reads (client/estimate/project/service lookups) | New Supabase queries in the MCP handler | The neutral `lib/agent-tools/query-company-data` fns | They already exist, are tenant-scoped (`.eq('company_id', …)`), parity-tested byte-for-byte against WhatsApp/chat output, and are the whole point of the milestone (bind, don't re-implement) |
| KB retrieval + RAG answer | New retrieval/answer logic | `askKnowledge` (→ `lib/knowledge/answer`) | Never-throws, industry+company-overlay scoped, already bound by chat + WhatsApp |
| Tenant resolution | A `companyId` tool input or a custom token parse | `auth.company_id` from `McpAuthContext` (resolved by `verifyMcpRequest` → `resolveAccessToken`) | OAuth token → company is the trusted path; the consent screen already authorized the (user, company) tuple |
| Scope checking | Inline scope-string parsing | `requireScope(auth, 'mcp:read')` | RFC-6750 insufficient_scope already modeled |
| Typed tool errors | Plain `throw new Error` | `invalidInput` / `insufficientScope` from `lib/mcp/errors` | Carries the `{ kind }` discriminator the SDK serializes and tests assert on |

**Key insight:** This phase is a *binding* phase. The correct amount of new domain logic is **zero**. Every line of business behavior already exists and is tested; the new code is wiring + JSON-Schema definitions + the trusted-tenant plumbing.

## Common Pitfalls

### Pitfall 1: The hardcoded tool-count assertions in mcp-tool-registry.test.ts
**What goes wrong:** Adding 6 tools breaks 3 existing assertions in `tests/unit/mcp-tool-registry.test.ts` that hardcode `6`: `buildAllTools(...)` `toHaveLength(6)`, `advertises the expected tool names` (an exact 6-name array), and `the registered tools/list handler advertises 6 tools` (`toHaveLength(6)`).
**Why it happens:** MPAR-01 says "existing suite stays green unchanged" — but those specific count assertions are *contract assertions on the registry*, which legitimately changes when tools are added. The intent of MPAR-01 is "don't break read.ts/write.ts behavior", not "freeze the registry count forever."
**How to avoid:** Update those 3 assertions to the new total (6 → **12**) and extend the expected-names array with the 6 new names, in the SAME plan that adds the tools. This is an expected, in-scope edit — flag it explicitly in the plan so the planner doesn't treat it as a regression. The plan should state the new total and name list.
**Warning signs:** `npx vitest run tests/unit/mcp-tool-registry.test.ts` fails on `toHaveLength` after wiring the builder.

### Pitfall 2: Wrapping the query-tool string in JSON
**What goes wrong:** Using `read.ts`'s `jsonContent` (which does `JSON.stringify(payload, null, 2)`) on the neutral query fns' return value would double-encode an already-formatted human-readable string, breaking byte-output parity with WhatsApp/chat.
**Why it happens:** Copy-paste from `read.ts`, which returns structured `{ items }` objects.
**How to avoid:** The neutral query fns return a **plain string**; emit `{ content: [{ type: 'text', text }] }` directly. Only `read.ts`'s structured tools need `JSON.stringify`.
**Warning signs:** Tool output shows escaped quotes / a quoted JSON string instead of the bullet list.

### Pitfall 3: companies.industries null/empty
**What goes wrong:** A company with no `industries[]` set could pass `undefined` to `askKnowledge`.
**Why it happens:** The column is nullable.
**How to avoid:** Coalesce to `[]` exactly as chat/whatsapp do: `company?.industries ?? []`. `retrieve()` handles an empty industry scope (still serves the company overlay + any neutral industry rows). Already proven in production by the chat/WhatsApp paths.

### Pitfall 4: Putting companyId in inputSchema (MSEC-01 violation)
**What goes wrong:** A well-meaning "let the caller pick the company" schema field opens a cross-tenant read.
**Why it happens:** The neutral fns *take* `companyId` as a positional arg, which can tempt surfacing it as input.
**How to avoid:** `companyId` is a **closure/positional value from `auth.company_id`**, never a zod field. Write the MSEC-01 schema-walk test (mirror `lib/chat`'s `tools.test.ts` T-lrf-01 walk) asserting no new tool's `inputSchema.properties` contains `companyId` / `company_id` / `tenant` / `tenantId`.
**Warning signs:** `inputSchema.properties` lists anything other than `question` (ask_knowledge) / `name` (the 3 name-takers) / `{}` (the 2 listers).

### Pitfall 5: `getProjectStatus` is name-keyed, not the same as read.ts `list_projects`
**What goes wrong:** Conflating the new `get_project_status` (neutral, fuzzy-name lookup, string output) with the existing `list_projects` (DB read, paginated, structured) — they are different tools with different inputs.
**How to avoid:** `get_project_status` input is `{ name }` and wraps `getProjectStatus(companyId, supabase, name)`. It coexists with `list_projects`; both are read-only. No naming collision (different tool names).

## Code Examples

### The neutral query signatures (the contract each MCP tool wraps)
```typescript
// Source: lib/agent-tools/query-company-data.ts
findClientByName(companyId: string, supabase: SupabaseClient, name: string): Promise<string>
getLatestEstimateForClient(companyId: string, supabase: SupabaseClient, name: string): Promise<string>
getProjectStatus(companyId: string, supabase: SupabaseClient, name: string): Promise<string>
listRecentEstimates(companyId: string, supabase: SupabaseClient): Promise<string>
listServices(companyId: string, supabase: SupabaseClient): Promise<string>
findServiceByName(companyId: string, supabase: SupabaseClient, name: string): Promise<string>  // 6th read — see Open Q1
```

### The neutral knowledge signature
```typescript
// Source: lib/agent-tools/ask-knowledge.ts
askKnowledge(
  question: string,
  ctx: { industries: string[]; companyId: string; language?: 'en' | 'pt' | 'es' }
): Promise<string>   // never throws — FALLBACK string on outage
```

### Recommended tool name → neutral fn map (MQRY-01 + MKB-01)
| MCP tool name | inputSchema | Neutral fn | Title (annotation) |
|---------------|-------------|------------|--------------------|
| `ask_knowledge` | `{ question: string }` (required) | `askKnowledge(question, { industries, companyId, language })` | `Ask knowledge base` |
| `find_client` | `{ name: string }` (required) | `findClientByName(companyId, supabase, name)` | `Find client` |
| `get_latest_estimate` | `{ name: string }` (required) — client name | `getLatestEstimateForClient(companyId, supabase, name)` | `Get latest estimate` |
| `get_project_status` | `{ name: string }` (required) | `getProjectStatus(companyId, supabase, name)` | `Get project status` |
| `list_recent_estimates` | `{}` | `listRecentEstimates(companyId, supabase)` | `List recent estimates` |
| `list_services` | `{}` | `listServices(companyId, supabase)` | `List services` |

> The REQUIREMENTS/SEED tool name is `get_latest_estimate`; the neutral fn is `getLatestEstimateForClient` and its input is a **client name** (it resolves the client, then that client's latest estimate). Description should say "Get the most recent estimate for a client, by client name."

### Wiring into the registry (the only edit to existing source)
```typescript
// Source: lib/mcp/tools/registry.ts (buildAllTools) — add the new builder
import { buildKnowledgeQueryTools } from '@/lib/mcp/tools/knowledge-query'

export function buildAllTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    ...buildReadTools(auth),
    ...buildWriteTools(auth),
    ...buildKnowledgeQueryTools(auth),   // +6 read-only tools
  ]
}
```
`registerAllTools` needs no change — it concatenates whatever `buildAllTools` returns and dispatches by name. `server.ts` needs no change.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP tools as thin HTTP wrappers over API routes (original SEED-030 plan) | MCP tools bind the **channel-neutral `lib/agent-tools/` functions** directly (in-process) | v4.9 extraction (phases 122-126) + this milestone | No HTTP hop; one core shared by WhatsApp = chat = MCP. The "5 tools MVP" SEED-030 cut is superseded by channel parity |
| v3 AI-SDK `tool({ parameters })` | v6 `tool({ inputSchema })` (chat channel) | v4.9 (`ai@6`) | Not directly relevant to MCP (MCP tools use JSON-Schema `inputSchema` literals, not the `ai` package), but confirms the chat binding to mirror |

**Deprecated/outdated:** The SEED-030 "Initial tool scope (MVP) — 5 tools" and the API-wrapper architecture are explicitly superseded (see SEED-030 channel-parity banner + STATE.md). Bind the neutral core, do not wrap HTTP.

## Open Questions

1. **6th neutral read `findServiceByName` — include it as a `find_service` MCP tool?**
   - What we know: `lib/agent-tools/query-company-data.ts` exports SIX data-reads; the barrel re-exports `findServiceByName`; `lib/chat/tools.ts` binds all six (chat has a `findServiceByName` tool). But REQUIREMENTS MQRY-01 and the SEED enumerate only **5** query tools (no `find_service`).
   - What's unclear: whether MCP parity should expose `find_service` too (chat does) or hold to the literal 5 named in MQRY-01.
   - Recommendation: **Follow MQRY-01 literally — ship the 5 named tools + `ask_knowledge` (6 total new).** MQRY-01 is the locked requirement and names exactly 5. If full chat parity is desired, `find_service` is a trivial later add (or a Phase-128 parity note), but do not expand scope beyond the requirement without a CONTEXT decision. Flag this to the planner as a one-line scope note.

2. **Reply language for `ask_knowledge`** — chat/whatsapp pass the company's `default_estimate_language`. Recommendation: do the same (read it in the same `companies` query, coalesce to `undefined` for unsupported values). Low-risk, free parity. Confidence: HIGH.

## Environment Availability

Step 2.6: SKIPPED for external services (no new infra). All dependencies are in-process modules already present and exercised by the running v4.1 MCP server + v4.9 chat. The runtime relies on:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@modelcontextprotocol/sdk` | Tool definitions/annotations | ✓ (package.json) | ^1.29.0 | — |
| `zod` | Input validation | ✓ | ^4.3.6 | — |
| Supabase service client (`requireServiceClient`) | data reads + industries lookup | ✓ (in use) | — | — |
| OpenRouter key (for `askKnowledge` → `answer`) | `ask_knowledge` runtime answer | runtime env (`getORKey`) | — | `answer()` returns FALLBACK string if missing — never crashes the tool |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** OpenRouter key absence degrades `ask_knowledge` to its built-in FALLBACK string (never an error) — acceptable and already the production behavior for chat/WhatsApp knowledge.

## Validation Architecture

`nyquist_validation` is `true` in `.planning/config.json` → this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (full suite ~335 files / 2335 tests as of v4.9 close) |
| Config file | `vitest.config.*` (repo root; existing) |
| Quick run command | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts` (new file) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MKB-01 | `ask_knowledge` resolves `industries[]` from `auth.company_id` and calls `askKnowledge`; input is `{ question }` only | unit | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts -t ask_knowledge` | ❌ Wave 0 (new file) |
| MQRY-01 | 5 query tools each wrap the neutral data-read with trusted `auth.company_id` + service client; correct string output | unit | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts -t query` | ❌ Wave 0 |
| MSEC-01 | NO new tool `inputSchema` contains `companyId`/`company_id`/`tenant`/`tenantId` (schema-walk over all 6) | unit | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts -t "no tenant input"` | ❌ Wave 0 |
| MSEC-02 | All 6 new tools carry `readOnlyHint: true` + `destructiveHint: false` | unit | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts -t annotations` | ❌ Wave 0 |
| (regression) | Registry advertises 12 tools; updated counts/names | unit | `npx vitest run tests/unit/mcp-tool-registry.test.ts` | ✅ exists (MODIFY counts) |
| (regression) | read.ts/write.ts suites unchanged + green (MPAR-01 precursor) | unit | `npx vitest run tests/unit/mcp-read-tools.test.ts tests/unit/mcp-create-estimate.test.ts` | ✅ exists (untouched) |

The MSEC-01 schema-walk should mirror the proven T-lrf-01 walk in `tests/unit/chat/tools.test.ts` (walks each tool's schema asserting no tenant key). For MCP, walk `definition.inputSchema.properties` keys.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts tests/unit/mcp-tool-registry.test.ts`
- **Per wave merge:** `npx vitest run tests/unit` (or at minimum all `tests/unit/mcp-*.test.ts` + `tests/unit/agent-tools`)
- **Phase gate:** Full `npx vitest run` green before `/gsd:verify-work`. (Note the KNOWN parallel-only flake `tests/unit/mcp-route-contract.test.ts` GET-405 — 8/8 green in isolation; documented in STATE.md, not a regression.)

### Wave 0 Gaps
- [ ] `tests/unit/mcp-knowledge-query-tools.test.ts` — covers MKB-01, MQRY-01, MSEC-01, MSEC-02 (mock `@/lib/supabase/service` like `mcp-read-tools.test.ts`; mock `@/lib/agent-tools` to assert the trusted `companyId`/service-client positional args and the `{ question }`/`{ name }`/`{}` inputs; annotation + schema-walk assertions)
- [ ] `tests/unit/mcp-tool-registry.test.ts` — MODIFY the 3 hardcoded `6` count assertions → `12` and extend the expected-names array with the 6 new names
- [ ] Framework install: none — Vitest already present

*(No new conftest/fixtures needed — the `makeMockClient` chainable-mock pattern from `mcp-read-tools.test.ts` and the agent-tools mock pattern from `tests/unit/chat/tools.test.ts` are both reusable templates.)*

## Project Constraints (from CLAUDE.md)

- **No secrets in any file** (incl. `.planning/`, comments, tests) — use placeholders. (This phase introduces no secrets; OpenRouter/Supabase keys are read at runtime via existing helpers, never literal.)
- **Tech stack:** Next.js 14+ App Router, TypeScript strict, zod. (MCP route already `runtime = 'nodejs'`, `force-dynamic` — unchanged.)
- **RLS + service-role posture:** service role key never in the browser; the MCP server runs server-side (`import 'server-only'` on every tool module). Tenant isolation at the query layer via `.eq('company_id', auth.company_id)` — the OAuth consent already authorized the (user, company) tuple.
- **All AI calls server-side** — `askKnowledge` → `answer()` runs in the Node route, satisfied.
- **GSD workflow enforcement** — edits go through `/gsd:execute-phase`.

These do not conflict with any research recommendation.

## Sources

### Primary (HIGH confidence — codebase, read directly)
- `lib/mcp/tools/registry.ts` — `ToolDefinitionEntry`/`ToolDefinition`/`ToolResult` types, `buildAllTools`, `registerAllTools`
- `lib/mcp/tools/read.ts` — the 4 read-tool template: `READ_ONLY_ANNOTATIONS`, definitions, handlers, `buildReadTools`, scope gate, `__testing`
- `lib/mcp/tools/write.ts` — annotation tiers, handler/builder pattern, `__testing`
- `lib/mcp/server.ts`, `app/api/mcp/route.ts` — server wiring + auth context plumbing (no change needed)
- `lib/mcp/auth.ts`, `lib/mcp/scope.ts`, `lib/mcp/errors.ts`, `lib/mcp/pagination.ts` — `McpAuthContext` (trusted `company_id`), `requireScope`, typed errors
- `lib/agent-tools/ask-knowledge.ts`, `lib/agent-tools/query-company-data.ts`, `lib/agent-tools/index.ts` — the neutral capabilities + signatures the tools wrap
- `lib/chat/tools.ts` — the SAME neutral binding from the chat channel (the closest analog; mirror its closure-over-trusted-ctx pattern)
- `app/api/chat/route.ts` + `lib/whatsapp/intent-router.ts` — the `companies.industries`/`default_estimate_language` service-client read for `ask_knowledge`
- `lib/knowledge/answer.ts` — confirms `askKnowledge` never-throws (FALLBACK on outage)
- `tests/unit/mcp-read-tools.test.ts`, `tests/unit/mcp-tool-registry.test.ts` — the test patterns to mirror + the 3 hardcoded `6` count assertions to update
- `.planning/REQUIREMENTS.md` (v4.10), `.planning/seeds/SEED-030-mcp-server-xtimator.md`, `.planning/STATE.md`, `.planning/config.json`, `CLAUDE.md`
- `package.json` (verified versions: `@modelcontextprotocol/sdk@^1.29.0`, `zod@^4.3.6`, `ai@^6.0.209`)

### Secondary / Tertiary
- None needed — fully internal, no external doc lookup required.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; every module is in-tree and exercised by running code
- Architecture: HIGH — the new tools are a near-mechanical mirror of two existing, tested patterns (`read.ts` entry shape + `lib/chat/tools.ts` neutral binding)
- Pitfalls: HIGH — the count-assertion break and string-vs-JSON wrapping are concretely identified from the actual test/handler source

**Research date:** 2026-06-25
**Valid until:** 30 days (stable internal surface; the only external dep is the unchanged v4.1 MCP SDK)
```
