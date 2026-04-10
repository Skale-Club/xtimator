# Phase 2: Company Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 02-company-onboarding
**Areas discussed:** Wizard layout & flow, Industry selector & brand picker, Logo upload experience, Form density & validation

---

## Wizard Layout & Flow

### Q1: How should the onboarding wizard be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Single page with stepper | All 3 steps on one page, content swaps with animated transitions. Step indicator bar at top. | ✓ |
| Separate pages per step | Each step is its own route (/onboarding/step-1, etc.). Browser back button works naturally. | |
| Full-screen immersive | Each step takes full viewport with large typography. One field group at a time, typeform-style. | |

**User's choice:** Single page with stepper (Recommended)

### Q2: What should 'Skip for now' do?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip entire wizard | One link skips ALL remaining steps, goes to /dashboard. Minimal company row created. | ✓ |
| Skip individual steps | Each step has its own skip. More granular. | |
| No skip option | User must complete all 3 steps. | |

**User's choice:** Skip entire wizard (Recommended)

### Q3: Should the wizard reuse the AuthCard centered layout or use a wider card?

| Option | Description | Selected |
|--------|-------------|----------|
| Wider card (~600px) | More room for form fields. Prevents excessive vertical scrolling on Step 3. | ✓ |
| Same AuthCard width (400px) | Consistent with login/signup. Fields stack vertically. | |
| You decide | Claude picks best width per step. | |

**User's choice:** Wider card (~600px)

### Q4: Should there be a Back button on steps 2 and 3?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, Back + Next | Standard wizard navigation. Last step shows 'Complete Setup'. | ✓ |
| Next only, edit via step indicator | No back button. Click step dots to jump back. | |

**User's choice:** Yes, Back + Next (Recommended)

---

## Industry Selector & Brand Picker

### Q1: How should the 8 industry options be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| Icon cards grid | 8 cards in 2x4 grid with icon + label. Tap to select, highlight border. | ✓ |
| Dropdown select | Simple shadcn Select component. Compact, functional. | |
| Radio group list | Vertical radio buttons with descriptions. | |

**User's choice:** Icon cards grid (Recommended)

### Q2: How should the brand color picker work?

| Option | Description | Selected |
|--------|-------------|----------|
| Preset palette + custom | 8-12 curated swatches + Custom hex input option. | ✓ |
| Full color picker only | Standard color picker widget. Maximum flexibility. | |
| Presets only | Fixed set of colors, no custom option. | |

**User's choice:** Preset palette + custom (Recommended)

### Q3: Should there be a 'Custom / Other' industry option?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with text input | 9th card labeled 'Other' with text field for custom industry. | ✓ |
| No, just the 8 options | Users pick the closest match. | |

**User's choice:** Yes, with text input (Recommended)

---

## Logo Upload Experience

### Q1: How should the logo upload zone look in the wizard?

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar circle + upload | Large circular placeholder. Click to upload. Preview in circle with Change/Remove. | ✓ |
| Drag & drop zone | Dashed-border dropzone. More desktop-oriented. | |
| Simple file input | Standard 'Choose file' button. Minimal. | |

**User's choice:** Avatar circle + upload (Recommended)

### Q2: Which step should the logo upload appear in?

| Option | Description | Selected |
|--------|-------------|----------|
| Step 2 with industry & branding | Groups visual identity together. | ✓ |
| Step 1 with business info | Identity upfront. | |
| Step 3 with address & defaults | Finishing touch at the end. | |

**User's choice:** Step 2 with industry & branding (Recommended)

---

## Form Density & Validation

### Q1: Which fields should be required vs optional in Step 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Only company name required | Minimum to create company row. Low friction. | ✓ |
| Company name + owner name required | Core identity fields. | |
| All fields required | Forces complete profile. | |

**User's choice:** Only company name required (Recommended)

### Q2: How should Step 3 handle defaults?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-filled with sensible defaults | Tax 0%, payment 'Net 30', warranty '1 year'. User adjusts if needed. | ✓ |
| Empty fields, user fills in | No assumptions. More effort required. | |
| You decide | Claude picks defaults based on industry. | |

**User's choice:** Pre-filled with sensible defaults (Recommended)

### Q3: Should validation happen inline or on submit?

| Option | Description | Selected |
|--------|-------------|----------|
| On blur + on submit | Validate when user leaves field + on Next click. Inline errors. | ✓ |
| On submit only | All errors shown at once on Next click. | |
| Real-time as you type | Validate every keystroke. Immediate but nagging. | |

**User's choice:** On blur + on submit (Recommended)

---

## Claude's Discretion

- Exact animation/transition between wizard steps
- Specific Lucide icons for each industry card
- Exact preset color palette values
- Step indicator visual design
- Company initial rendering in avatar placeholder

## Deferred Ideas

None — discussion stayed within phase scope.
