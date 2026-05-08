# Requirements: v1.5 — Zero-friction Project Onboarding

## v1.5 Requirements

### Unified Capture Screen

- [ ] **CAPTURE-01**: The audio recorder is the hero element of the capture screen — large, prominent, with the existing full-screen recording UX preserved
- [ ] **CAPTURE-02**: The capture screen has a "Description" field where the user can type a job description alongside or instead of recording audio
- [ ] **CAPTURE-03**: The capture screen has a photo upload area where the user can add photos alongside or instead of recording audio
- [ ] **CAPTURE-04**: "Generate Estimate" button is enabled when at least one input is present: audio transcript, description text, or at least one photo

### Frictionless Client Association

- [ ] **CLIENTASSOC-01**: User can create a project without selecting or creating a client upfront — the client can be linked after project creation
- [ ] **CLIENTASSOC-02**: The client detail page has a "New Project" button that creates a new project pre-linked to that specific client
- [ ] **CLIENTASSOC-03**: After estimate generation, if the AI detected a client name in the content, the user sees a non-blocking confirmation prompt to accept or dismiss the suggested client link before any record is created or modified
- [ ] **CLIENTASSOC-04**: Projects without a linked client display a visible "Link client" card in the project Overview tab

---

## Future Requirements (Deferred)

- **Markdown variant** — output em `**bold**` para canais que renderizam markdown (Slack, Discord) — v1.5 backlog
- **Bulk price adjustment across all categories** — aplicar o mesmo % a todo o price book de uma vez — backlog
- **`input_mode` analytics column** — persist `audio | text | photos | mixed` on projects table for usage analytics — v2
- **Last-used input mode preference** — remember which capture modality the user last used — v1.6
- **Inline recorder as standalone route** — short-form audio recorder (< 2min) as separate entry point without full-screen — v1.6
- **Fuzzy client name matching** — match "Maria S" to "Maria Silva" during AI extraction — v2

## Out of Scope

- Video input — not accepted; processing complexity exceeds value
- Exclusive 3-way modal picker (pick one, not combined) — user confirmed combined capture screen is correct
- WhatsApp channel (SEED-008) — standalone milestone
- Iterative estimate refinement (SEED-006) — next milestone candidate
- Silent AI client auto-creation without user confirmation — intentionally excluded to prevent client list pollution
- Multi-number WhatsApp per company — out of scope

## Traceability

| REQ-ID | Feature Area | Phase | Status |
|--------|-------------|-------|--------|
| CAPTURE-01 | Unified Capture Screen | Phase 28 | Pending |
| CAPTURE-02 | Unified Capture Screen | Phase 28 | Pending |
| CAPTURE-03 | Unified Capture Screen | Phase 28 | Pending |
| CAPTURE-04 | Unified Capture Screen | Phase 28 | Pending |
| CLIENTASSOC-01 | Client Association | Phase 29 | Pending |
| CLIENTASSOC-02 | Client Association | Phase 29 | Pending |
| CLIENTASSOC-03 | Client Association | Phase 30 | Pending |
| CLIENTASSOC-04 | Client Association | Phase 29 | Pending |
