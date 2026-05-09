# Phase 30: AI Client Extraction - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

After estimate generation, detect a likely client name from the same AI pass and offer a non-blocking way to link that client to the project. This phase does not auto-create or auto-link clients, does not add fuzzy matching, and does not change the estimate editor flow when no client name is detected.

Phase 28 provides generation from transcript, description text, and photos. Phase 29 provides manual client linking infrastructure. Phase 30 connects those pieces with a lightweight suggestion after generation.

</domain>

<decisions>
## Implementation Decisions

### Suggestion Trigger
- **D-01:** Only show a suggestion when the project has no linked client and the AI returns a non-empty detected client name.
- **D-02:** If the project already has a linked client, suppress the client suggestion entirely.
- **D-03:** If the AI does not detect a client name, preserve the current flow exactly: no toast, no extra UI, no DB changes.

### AI Output Contract
- **D-04:** Extend the structured estimate output with optional client-detection fields, keeping estimate generation as the single AI call.
- **D-05:** The minimum output is `suggested_client_name`; optional supporting fields such as confidence or rationale may be included if useful for guardrails, but downstream UI should not depend on verbose explanations.
- **D-06:** The AI should be instructed to return a client name only when the content clearly names the customer/homeowner/business. It should not infer generic names from project title patterns or addresses.

### Matching And User Choice
- **D-07:** Match detected names against existing company clients using a conservative case-insensitive exact or normalized-name comparison. Fuzzy matching is deferred to v2 per REQUIREMENTS.md.
- **D-08:** If a matching existing client is found, the toast offers an accept action that links the project to that client.
- **D-09:** If no matching client exists, the toast should offer a create/review path instead of creating a client automatically.
- **D-10:** Dismissal makes no changes and should not block the user from continuing in the estimate editor.

### UX Placement
- **D-11:** Use the existing `sonner` toast pattern for the non-blocking prompt after estimate generation succeeds.
- **D-12:** The prompt should appear after navigation/refresh lands the user on the estimate workspace, not as a modal during generation.
- **D-13:** Keep the copy short and action-oriented, e.g. "Detected client: Maria Silva" with "Link" or "Review" action.

### the agent's Discretion
- Decide the exact response payload shape between `/api/generate-estimate` and the client components, as long as the API remains backward-compatible for existing estimate-generation callers.
- Decide whether to reuse `linkProjectToClient` directly from the toast action or wrap it in a purpose-specific client suggestion component/action.
- Decide whether the no-match "create/review" path opens an existing client creation route, a lightweight dialog, or a future-safe placeholder, while avoiding silent creation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product And Requirements
- `.planning/ROADMAP.md` - Phase 30 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` - CLIENTASSOC-03 and explicit out-of-scope constraints, including no silent AI client auto-creation and deferred fuzzy matching.
- `.planning/STATE.md` - Current milestone state and prior phase decisions.

### Prior Phase Context
- `.planning/phases/28-unified-capture-screen/28-01-SUMMARY.md` - Multi-modal generation flow that Phase 30 hooks into.
- `.planning/phases/29-frictionless-project-creation-client-linking/29-01-SUMMARY.md` - Manual client-linking infrastructure and server actions.
- `.planning/phases/29-frictionless-project-creation-client-linking/29-UAT.md` - Human UAT was skipped by user decision; do not treat it as behavioral validation.

### Code Integration Points
- `app/api/generate-estimate/route.ts` - Server-side estimate generation, AI output handling, project update, and API response.
- `lib/ai/types.ts` - `EstimateInput` and `EstimateOutput` contracts.
- `lib/ai/providers/anthropic.ts` - Claude tool schema for structured estimate output.
- `lib/ai/providers/gemini.ts` - Gemini function declaration for structured estimate output.
- `lib/ai/normalize.ts` - Normalizes provider output before persistence.
- `components/capture/capture-recorder.tsx` - Capture-screen generation flow and redirect after estimate creation.
- `components/workspace/estimate/estimate-tab.tsx` - Workspace estimate generation flow.
- `components/workspace/link-client-card.tsx` - Existing manual link UX and use of `linkProjectToClient`.
- `lib/actions/project.ts` - `linkProjectToClient` action to reuse for accepted suggestions.
- `app/api/clients/route.ts` - Existing lightweight client list endpoint.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `linkProjectToClient(projectId, clientId)` already updates `projects.client_id`, revalidates the project route, and returns a server-action result suitable for client UI.
- `sonner` toasts are already used across capture, estimate, and client-linking flows.
- `/api/clients` returns existing clients for a company and can support conservative name matching or feed a server-side match helper.

### Established Patterns
- AI generation is server-side through `/api/generate-estimate`; browser code calls it and then refreshes or navigates.
- `EstimateOutput` is normalized before persistence; adding optional client suggestion fields should be reflected in provider schemas and normalization together.
- The codebase avoids silent side effects for client association. Phase 29 requires explicit user selection, and Phase 30 should preserve that standard.

### Integration Points
- Add optional client suggestion data to the `aiEstimate` output path before `/api/generate-estimate` returns.
- Return suggestion metadata to generation callers so the client can show a toast after successful generation.
- For capture route redirects, pass suggestion metadata across navigation in a durable way if needed, because a toast cannot survive a hard route transition unless encoded or persisted somewhere.

</code_context>

<specifics>
## Specific Ideas

- Prefer a small, explicit payload such as `{ estimateId, version, clientSuggestion: { detectedName, matchedClientId, matchedClientName } | null }`.
- If the suggestion must survive capture-route navigation, consider a URL search param, sessionStorage handoff, or project-scoped ephemeral server state. Pick the least invasive option during planning.
- Keep matching conservative for v1.5; avoid fuzzy matching until the deferred v2 requirement is promoted.

</specifics>

<deferred>
## Deferred Ideas

- Fuzzy client name matching, such as matching "Maria S" to "Maria Silva", remains deferred to v2.
- Silent AI client creation remains out of scope by design.
- A richer client resolution modal can be a later enhancement if the toast path feels too cramped.

</deferred>

---

*Phase: 30-ai-client-extraction*
*Context gathered: 2026-05-09*
