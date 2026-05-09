# Requirements: v1.6 - Multi-modal Project Input

## v1.6 Requirements (SEED-005)

### Wizard Modality Selection

- [x] **WIZARD-01**: Wizard has a second step for modality selection with 3 large clickable cards: Audio, Text, Photos
- [x] **WIZARD-02**: Each card shows an icon, label, and brief description of the use case
- [x] **WIZARD-03**: Selecting a card redirects to the appropriate route based on modality
- [x] **WIZARD-04**: Project stores `input_mode` as optional field (`audio | text | photos | mixed | null`)

### Text Input Route

- [ ] **TEXT-01**: Route `/projects/[id]/describe` exists with a large textarea (minimum 10 lines)
- [ ] **TEXT-02**: Textarea has a placeholder with example job description
- [ ] **TEXT-03**: User can save text as recording transcript (storage_path null, duration_seconds null)
- [ ] **TEXT-04**: "Generate Estimate" button triggers the same pipeline as audio route
- [ ] **TEXT-05**: Route is mobile-first with large tap targets

### Photos Input Route

- [ ] **PHOTO-01**: Route `/projects/[id]/photos-input` exists with direct photo upload
- [ ] **PHOTO-02**: Uses existing PhotoDropZone component for upload
- [ ] **PHOTO-03**: "Generate from Photos" button is visible and prominent when at least 1 photo is added
- [ ] **PHOTO-04**: Pipeline uses Claude Vision to analyze photos and generate estimate (no transcript required)

---

# Requirements: v1.5 - Zero-friction Project Onboarding

## v1.5 Requirements

### Unified Capture Screen

- [x] **CAPTURE-01**: The audio recorder is the hero element of the capture screen - large, prominent, with the existing full-screen recording UX preserved
- [x] **CAPTURE-02**: The capture screen has a "Description" field where the user can type a job description alongside or instead of recording audio
- [x] **CAPTURE-03**: The capture screen has a photo upload area where the user can add photos alongside or instead of recording audio
- [x] **CAPTURE-04**: "Generate Estimate" button is enabled when at least one input is present: audio transcript, description text, or at least one photo

### Frictionless Client Association

- [x] **CLIENTASSOC-01**: User can create a project without selecting or creating a client upfront - the client can be linked after project creation
- [x] **CLIENTASSOC-02**: The client detail page has a "New Project" button that creates a new project pre-linked to that specific client
- [x] **CLIENTASSOC-03**: After estimate generation, if the AI detected a client name in the content, the user sees a non-blocking confirmation prompt to accept or dismiss the suggested client link before any record is created or modified
- [x] **CLIENTASSOC-04**: Projects without a linked client display a visible "Link client" card in the project Overview tab

---

## Future Requirements (Deferred)

- **Markdown variant** - output em `**bold**` para canais que renderizam markdown (Slack, Discord) - v1.6 backlog
- **Bulk price adjustment across all categories** - aplicar o mesmo % a todo o price book de uma vez - backlog
- **`input_mode` analytics column** - persist `audio | text | photos | mixed` on projects table for usage analytics - v2
- **Last-used input mode preference** - remember which capture modality the user last used - v1.7
- **Inline recorder as standalone route** - short-form audio recorder (< 2min) as separate entry point without full-screen - v1.7
- **Fuzzy client name matching** - match "Maria S" to "Maria Silva" during AI extraction - v2

## Out of Scope

- Video input - not accepted; processing complexity exceeds value
- Exclusive 3-way modal picker (pick one, not combined) - user confirmed combined capture screen is correct
- WhatsApp channel (SEED-008) - standalone milestone
- Iterative estimate refinement (SEED-006) - next milestone candidate
- Silent AI client auto-creation without user confirmation - intentionally excluded to prevent client list pollution
- Multi-number WhatsApp per company - out of scope

## Traceability

| REQ-ID | Feature Area | Phase | Status |
|--------|-------------|-------|--------|
| WIZARD-01 | Wizard Modality | Phase 31 | Pending |
| WIZARD-02 | Wizard Modality | Phase 31 | Pending |
| WIZARD-03 | Wizard Modality | Phase 31 | Pending |
| WIZARD-04 | Wizard Modality | Phase 31 | Pending |
| TEXT-01 | Text Input Route | Phase 32 | Pending |
| TEXT-02 | Text Input Route | Phase 32 | Pending |
| TEXT-03 | Text Input Route | Phase 32 | Pending |
| TEXT-04 | Text Input Route | Phase 32 | Pending |
| TEXT-05 | Text Input Route | Phase 32 | Pending |
| PHOTO-01 | Photos Input Route | Phase 33 | Pending |
| PHOTO-02 | Photos Input Route | Phase 33 | Pending |
| PHOTO-03 | Photos Input Route | Phase 33 | Pending |
| PHOTO-04 | Photos Input Route | Phase 33 | Pending |
| CAPTURE-01 | Unified Capture Screen | Phase 28 | Complete |
| CAPTURE-02 | Unified Capture Screen | Phase 28 | Complete |
| CAPTURE-03 | Unified Capture Screen | Phase 28 | Complete |
| CAPTURE-04 | Unified Capture Screen | Phase 28 | Complete |
| CLIENTASSOC-01 | Client Association | Phase 29 | Complete |
| CLIENTASSOC-02 | Client Association | Phase 29 | Complete |
| CLIENTASSOC-03 | Client Association | Phase 30 | Complete |
| CLIENTASSOC-04 | Client Association | Phase 29 | Complete |
