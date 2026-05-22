---
phase: 260522-gnx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/ui/phone-input.tsx
  - components/onboarding/phone-input.tsx
  - components/onboarding/survey/steps/phone-step.tsx
  - lib/phone/countries.ts
  - lib/phone/format.ts
  - components/clients/client-sheet.tsx
  - components/settings/company-info-form.tsx
  - components/onboarding/step-business-info.tsx
  - components/workspace/send/send-form.tsx
  - app/admin/integrations/twilio-from-phone-form.tsx
  - components/settings/whatsapp-connect-card.tsx
  - components/pdf/estimate-pdf.tsx
  - tests/unit/phone/format.test.ts
autonomous: true
requirements:
  - QUICK-260522-gnx
must_haves:
  truths:
    - "A shared `<PhoneInput>` component at `components/ui/phone-input.tsx` exists with country-flag selector (US/BR/CA preferred + 15 others)."
    - "`<PhoneInput>` correctly pre-populates from `value` prop on mount (E.164, formatted, or plain-digits) and stays in sync when `value` changes externally."
    - "All 6 target forms + the onboarding survey phone-step render the new `<PhoneInput>` instead of a plain `<Input>` for phone fields, with no regression to form validation or submission."
    - "`formatPhoneForDisplay(raw)` in `lib/phone/format.ts` detects country by dial prefix and returns `+{dial} {masked}` for known countries, raw input for unknown, empty string for empty input."
    - "PDF estimate (`components/pdf/estimate-pdf.tsx`) renders company.phone and client.phone through `formatPhoneForDisplay` — no other display surfaces are touched."
    - "Unit tests for `formatPhoneForDisplay` pass: US E.164, US already-formatted, BR E.164, unknown dial code, empty string."
  artifacts:
    - path: "components/ui/phone-input.tsx"
      provides: "Shared PhoneInput component (moved from components/onboarding/phone-input.tsx, with controlled-value parsing + RHF-compatible prop pass-through)"
      contains: "export function PhoneInput"
    - path: "lib/phone/countries.ts"
      provides: "Single source of truth for the 18-country list (code/name/dial/flag/format/preferred)"
      contains: "export const COUNTRIES"
    - path: "lib/phone/format.ts"
      provides: "formatPhoneForDisplay utility for PDF display"
      contains: "export function formatPhoneForDisplay"
    - path: "tests/unit/phone/format.test.ts"
      provides: "Unit coverage for the 5 documented cases"
  key_links:
    - from: "components/ui/phone-input.tsx"
      to: "lib/phone/countries.ts"
      via: "import { COUNTRIES }"
      pattern: "from '@/lib/phone/countries'"
    - from: "lib/phone/format.ts"
      to: "lib/phone/countries.ts"
      via: "import { COUNTRIES }"
      pattern: "from '@/lib/phone/countries'"
    - from: "components/pdf/estimate-pdf.tsx"
      to: "lib/phone/format.ts"
      via: "import { formatPhoneForDisplay }"
      pattern: "formatPhoneForDisplay\\("
    - from: "components/clients/client-sheet.tsx (and 5 other forms)"
      to: "components/ui/phone-input.tsx"
      via: "import { PhoneInput }"
      pattern: "<PhoneInput"
---

<objective>
Promote the existing onboarding `PhoneInput` into a shared UI component with controlled-value parsing, wire it into 6 production forms (plus the onboarding survey phone-step that the scope incorrectly identified as the existing consumer — see Discovery below), and add a pure `formatPhoneForDisplay` utility used only by the PDF estimate render.

Purpose: Consistent international phone capture across every form, with country-flag UX, while keeping stored data shape unchanged. PDF gains region-aware formatting; all other display surfaces are intentionally untouched.

Output: 1 shared component, 2 new lib files, 1 unit test file, 7 form/PDF integrations.
</objective>

<discovery>
Grep verification before planning:

```
PhoneInput|phone-input matches → only components/onboarding/phone-input.tsx
```

The scope claims `components/onboarding/survey/steps/phone-step.tsx` is the "only existing consumer" of `PhoneInput`. **This is incorrect.** That file uses a plain `<Input>` directly (confirmed by reading it: no `PhoneInput` import). The component currently has **zero consumers** in the codebase. This is actually a small win — no consumer needs an import path migration. We will, however, wire `<PhoneInput>` into `phone-step.tsx` as well (Task B), since that screen exists specifically to capture a phone number during onboarding and naturally benefits from the same component. This brings the total swap count from 6 to 7, but `phone-step.tsx` is the simplest of the lot.

Other discovery notes:
- Vitest config (`vitest.config.ts`) includes `tests/unit/**/*.test.ts` — new test file under `tests/unit/phone/format.test.ts` will be auto-picked up.
- No external phone library is needed — constraint locked in scope.
- `phone-input.tsx` currently has a real bug: it ignores incoming `value` on mount. `useState` initializes `localNumber` to `''` even when `value` is non-empty. This breaks edit/preload use cases (e.g. ClientSheet edit mode where `client.phone` is non-null). Task A fixes this.
- `whatsapp-connect-card.tsx` has a zod regex `^\+\d{7,15}$` on `phoneNumber`. Since `<PhoneInput>` emits `+{dial} {masked}` (with a space + parens/hyphens in the masked part), the field will FAIL this regex unless we strip non-digits before zod or relax the regex. Task B handles this for whatsapp-connect-card AND send-form (which has `^\+[1-9]\d{7,14}$`) by normalizing in the `onChange` adapter — see Task B action.
- `twilio-from-phone-form.tsx` is non-RHF (uses `useState(current)`). Task B uses `value={value}` + `onChange={setValue}` directly.
</discovery>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@components/onboarding/phone-input.tsx
@components/clients/client-sheet.tsx
@components/settings/company-info-form.tsx
@components/onboarding/step-business-info.tsx
@components/workspace/send/send-form.tsx
@app/admin/integrations/twilio-from-phone-form.tsx
@components/settings/whatsapp-connect-card.tsx
@components/pdf/estimate-pdf.tsx
@components/onboarding/survey/steps/phone-step.tsx

<interfaces>
<!-- Key contracts. Extracted from codebase to spare the executor a scavenger hunt. -->

From components/onboarding/phone-input.tsx (current, before move):
```typescript
interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
}
// COUNTRIES: 18 entries, each { code, name, dial, flag, format, preferred }
// preferred:true for US/BR/CA only.
// applyMask(digits, format) and maxDigits(format) are local helpers.
// onChange contract: emits `+${dial} ${masked}` when digits present, else ''.
```

Target shared component (new — components/ui/phone-input.tsx):
```typescript
export interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  id?: string
  name?: string
  placeholder?: string  // overrides country.format-derived placeholder
  disabled?: boolean
  autoFocus?: boolean
  className?: string    // applied to root wrapper or input — pick one and stick to it
}
export function PhoneInput(props: PhoneInputProps): JSX.Element
```

Target utility (new — lib/phone/format.ts):
```typescript
export function formatPhoneForDisplay(raw: string | null | undefined): string
// Empty/null/undefined → ''
// Strip non-digits. Detect country by trying dial-code prefixes in longest-first order
// against COUNTRIES (try 3-digit dials first: 351, 598; then 2-digit: 55, 91, 81, etc.;
// then 1-digit: 1).
// Match: return `+${dial} ${applyMask(localDigits, format)}`
// No match (or no leading dial that matches anything): return raw unchanged.
```

Target country source (new — lib/phone/countries.ts):
```typescript
export interface Country {
  code: string       // 'US'
  name: string       // 'United States'
  dial: string       // '1'
  flag: string       // emoji
  format: string     // '(###) ###-####'
  preferred: boolean
}
export const COUNTRIES: readonly Country[]
export function applyMask(digits: string, format: string): string
export function maxDigits(format: string): number
```

From components/pdf/estimate-pdf.tsx (touchpoints):
```typescript
// Line ~461: company.phone rendered inside a "|"-joined header line
[company.phone, company.email, company.website].filter(Boolean).join('  |  ')
// Line ~515-519: client.phone rendered as standalone Text node
{client.phone && (<Text style={[styles.infoValue, { color: '#6b7280' }]}>{client.phone}</Text>)}
```

From components/clients/client-sheet.tsx (target field):
```typescript
// react-hook-form FormField, field.value: string, field.onChange: (v:string)=>void
// Schema: phone: z.string().optional() (or similar — already string-typed)
```

From components/workspace/send/send-form.tsx (smsForm.to field):
```typescript
const sendSmsSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, '...'),
  // ↑ The regex requires no spaces. PhoneInput emits '+1 (555) 555-5555'.
  // Adapter must strip non-digits before passing to field.onChange,
  // OR relax regex to allow spaces/parens/hyphens. Task B chooses: strip in adapter.
})
```

From components/settings/whatsapp-connect-card.tsx (connectSchema):
```typescript
const connectSchema = z.object({
  phoneNumber: z.string().regex(/^\+\d{7,15}$/, '...'),
  // Same constraint as send-form. Same fix.
  // ...
})
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task A: Promote PhoneInput to shared UI + extract countries + fix value-init bug</name>
  <files>
    components/ui/phone-input.tsx (new),
    components/onboarding/phone-input.tsx (delete after move — replace contents with a one-line re-export OR delete + verify zero remaining imports),
    lib/phone/countries.ts (new)
  </files>
  <action>
    1. **Create `lib/phone/countries.ts`** as the single source of truth:
       - Export `Country` interface (code, name, dial, flag, format, preferred).
       - Export `COUNTRIES: readonly Country[]` containing the exact same 18 entries currently in `components/onboarding/phone-input.tsx` lines 15-34 (do NOT change order, dial codes, masks, or flags — the existing list is locked).
       - Export `applyMask(digits, format)` and `maxDigits(format)` (moved verbatim from `phone-input.tsx` lines 39-51).

    2. **Create `components/ui/phone-input.tsx`** by promoting the existing component:
       - Copy logic from `components/onboarding/phone-input.tsx`.
       - Replace local COUNTRIES const + applyMask/maxDigits with imports from `@/lib/phone/countries`.
       - Replace `interface PhoneInputProps` to add: `id?: string`, `name?: string`, `placeholder?: string`, `disabled?: boolean`, `autoFocus?: boolean`, `className?: string`. Pass `id`/`name`/`placeholder`/`disabled`/`autoFocus` down to the inner `<Input>`. Keep `value`, `onChange`, `onEnter` as before. Drop the hardcoded `id="survey-phone"` and `autoFocus` from the inner Input (move them to optional props with no default).
       - **Fix the value-initialization bug.** Replace `useState('')` for `localNumber` with a parse-from-value initializer:
         - Write a local helper `parseIncoming(value: string): { countryCode: string; localNumber: string }`.
         - It accepts any of: `+1 (508) 301-3010`, `+15083013010`, `5083013010`, `' '`, or `''`.
         - Empty/whitespace-only → `{ countryCode: 'US', localNumber: '' }`.
         - Strip leading whitespace + a leading `+` to get a digit string. (If no leading `+` and the digit-stripped string has 10 digits, assume US: `countryCode='US'`, `localNumber=applyMask(digits, US.format)`.)
         - If leading `+`: try dial-code prefix matches against `COUNTRIES` in longest-first order (sort dial-code lengths desc: 3 → 2 → 1). First match wins. If two countries share a dial (US and CA both dial '1'), pick US (preferred over CA per current ordering).
         - On match: `countryCode = matched.code`, `localNumber = applyMask(remainingDigits.slice(0, maxDigits(matched.format)), matched.format)`.
         - On no match: fallback `{ countryCode: 'US', localNumber: '' }` AND leave the parent's `value` as the externally-passed string (do not emit a synthetic onChange — see step 3).
       - Initialize `useState` from `parseIncoming(value)` for both `countryCode` and `localNumber`.
       - Add a `useEffect` that re-runs `parseIncoming(value)` and re-sets state IF the incoming `value` does NOT already match the value our internal state would emit (`+${dial} ${localNumber}`). This is the controlled-component sync — prevents loops while still picking up external resets (e.g. `form.reset()`).
       - Behavioral note: `onChange` contract stays exactly the same: `digits ? '+' + dial + ' ' + masked : ''`.

    3. **Delete `components/onboarding/phone-input.tsx`.** Grep confirmed zero consumers, so deletion is safe. If you want belt-and-suspenders: replace the file with `export { PhoneInput } from '@/components/ui/phone-input'` (one line, marks intent). **Pick one approach — do not do both.** Recommended: delete entirely; rerun `Grep` on `PhoneInput|phone-input` after deletion to confirm zero broken imports.

    Constraints:
    - Do NOT change the country list (count, order, dials, flags, or masks).
    - Do NOT change the `onChange` emit format. Downstream forms depend on string shape.
    - Do NOT introduce libphonenumber-js or any external phone library.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - `components/ui/phone-input.tsx` exists and exports `PhoneInput` with the extended props interface.
    - `lib/phone/countries.ts` exports `COUNTRIES`, `applyMask`, `maxDigits`.
    - `components/onboarding/phone-input.tsx` is gone (or is a one-line re-export from `@/components/ui/phone-input`).
    - `npx tsc --noEmit` passes (no broken imports, no unused exports).
    - Grep `from ['\"]@/components/onboarding/phone-input` returns zero hits.
  </done>
</task>

<task type="auto">
  <name>Task B: Wire shared PhoneInput into 7 phone-capture surfaces</name>
  <files>
    components/clients/client-sheet.tsx,
    components/settings/company-info-form.tsx,
    components/onboarding/step-business-info.tsx,
    components/workspace/send/send-form.tsx,
    app/admin/integrations/twilio-from-phone-form.tsx,
    components/settings/whatsapp-connect-card.tsx,
    components/onboarding/survey/steps/phone-step.tsx
  </files>
  <action>
    Replace the phone-field `<Input>` with `<PhoneInput>` in each of the 7 files. Preserve all form validation, schema definitions, and submit/save behavior. Each file's specifics:

    1. **`components/clients/client-sheet.tsx`** (RHF, line 233-245, `phone` field):
       - Add `import { PhoneInput } from '@/components/ui/phone-input'` at top.
       - Replace `<Input placeholder="Phone number" {...field} />` with:
         ```tsx
         <PhoneInput
           value={field.value ?? ''}
           onChange={field.onChange}
           placeholder="Phone number"
         />
         ```
       - Schema (`clientSchema`) stays string-typed; no schema changes needed.

    2. **`components/settings/company-info-form.tsx`** (RHF, line 165-177, `phone` field):
       - Add the same import.
       - Replace `<Input placeholder="(555) 123-4567" {...field} />` with:
         ```tsx
         <PhoneInput
           value={field.value ?? ''}
           onChange={field.onChange}
           placeholder="(555) 123-4567"
         />
         ```
       - Note: `defaultValues.phone` already pre-fills from `company.phone` on mount. Verified that Task A's value-init fix means the country flag picks up correctly from saved E.164 or formatted strings.

    3. **`components/onboarding/step-business-info.tsx`** (RHF, line 64-81, `phone` field):
       - Add import.
       - Replace `<Input type="tel" placeholder="(555) 123-4567" className="min-h-[44px]" {...field} />` with:
         ```tsx
         <PhoneInput
           value={field.value ?? ''}
           onChange={field.onChange}
           placeholder="(555) 123-4567"
         />
         ```
       - The `min-h-[44px]` mobile tap-target was on the old Input. The new PhoneInput's internal Input already has `min-h-[44px]` (verified in source). No regression.

    4. **`components/workspace/send/send-form.tsx`** (RHF, line 240-252, `smsForm.to` field — INSIDE the SMS TabsContent block):
       - Schema is `z.string().regex(/^\+[1-9]\d{7,14}$/)`. The PhoneInput's `+1 (555) 555-5555` shape will NOT match (spaces, parens, hyphens). Solution: adapter that strips non-digits before storing in form state.
       - Add import.
       - Replace `<Input placeholder="+15551234567" {...field} />` with:
         ```tsx
         <PhoneInput
           value={field.value ?? ''}
           onChange={(formatted) => {
             // Schema requires E.164 — strip mask chars before storing
             const digitsOnly = formatted.replace(/[^\d+]/g, '')
             field.onChange(digitsOnly)
           }}
           placeholder="+15551234567"
         />
         ```
       - Note: When the form re-renders with the stripped E.164 value, PhoneInput's `parseIncoming` (from Task A) re-formats it on display while the underlying form value stays E.164. Round-trip preserved.
       - Do NOT touch the schema regex.

    5. **`app/admin/integrations/twilio-from-phone-form.tsx`** (non-RHF, line 41-48, `value`/`onChange` with `setValue` from `useState`):
       - Add import.
       - Replace `<Input id="twilio-from-phone" placeholder="+15551234567" value={value} onChange={(e) => setValue(e.target.value)} disabled={isPending} />` with:
         ```tsx
         <PhoneInput
           id="twilio-from-phone"
           value={value}
           onChange={(formatted) => {
             // saveTwilioFromPhone expects E.164 — strip mask chars
             setValue(formatted.replace(/[^\d+]/g, ''))
           }}
           placeholder="+15551234567"
           disabled={isPending}
         />
         ```

    6. **`components/settings/whatsapp-connect-card.tsx`** (RHF, line 353-366, `phoneNumber` field — INSIDE the no-connection branch at the bottom):
       - Schema is `z.string().regex(/^\+\d{7,15}$/)`. Same strip-on-change pattern as send-form.
       - Add import.
       - Replace `<Input placeholder="+15551234567" {...field} />` with:
         ```tsx
         <PhoneInput
           value={field.value ?? ''}
           onChange={(formatted) => {
             field.onChange(formatted.replace(/[^\d+]/g, ''))
           }}
           placeholder="+15551234567"
         />
         ```
       - DO NOT touch the `verification-code` Input below (line 239-251) — that's a 6-digit numeric code, not a phone.

    7. **`components/onboarding/survey/steps/phone-step.tsx`** (non-RHF mini-survey, uses `values.phone` + `setValue`):
       - Discovery confirmed: this file does NOT currently use PhoneInput (despite scope's claim). Wire it now for consistency.
       - Add import.
       - Replace the `<Input id="survey-phone" type="tel" ... value={values.phone} onChange={(e) => setValue('phone', e.target.value)} ... />` block with:
         ```tsx
         <PhoneInput
           id="survey-phone"
           value={values.phone}
           onChange={(formatted) => setValue('phone', formatted)}
           onEnter={onNext}
           placeholder="(555) 123-4567"
           autoFocus
         />
         ```
       - Keep the sr-only `<Label htmlFor="survey-phone">` above — accessibility preserved.
       - Note: the survey schema for `phone` is permissive (free-text). Keep formatted value as-is (no stripping).

    Acceptance rules across all 7:
    - **No schema changes.** Don't relax regex constraints in send-form or whatsapp-connect-card.
    - **No data migration.** Existing stored phone strings load via Task A's `parseIncoming` and re-format on display.
    - Each form's submit path is unchanged — only the input UI is swapped.
    - Touched files compile (`tsc --noEmit` clean).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - All 7 files import `PhoneInput` from `@/components/ui/phone-input`.
    - All 7 files no longer use a plain `<Input>` for their phone field (verified by grepping each file for `<Input` near phone context).
    - `npx tsc --noEmit` is clean.
    - Manual sanity check (not blocking, but recommended): open `/settings/company-info` in dev, confirm the saved phone preloads with the correct flag.
  </done>
</task>

<task type="auto">
  <name>Task C: Create formatPhoneForDisplay util + unit tests + apply to PDF only</name>
  <files>
    lib/phone/format.ts (new),
    tests/unit/phone/format.test.ts (new),
    components/pdf/estimate-pdf.tsx
  </files>
  <action>
    1. **Create `lib/phone/format.ts`**:
       ```typescript
       import { COUNTRIES, applyMask, maxDigits } from '@/lib/phone/countries'

       /**
        * Region-aware phone formatter for display surfaces (currently: PDF only).
        * - Empty/null/undefined → ''
        * - Strips non-digits, detects country by dial-code prefix (longest-first match),
        *   returns `+{dial} {masked}`.
        * - Unknown dial code → returns the raw input unchanged.
        */
       export function formatPhoneForDisplay(raw: string | null | undefined): string {
         if (!raw) return ''
         const trimmed = raw.trim()
         if (!trimmed) return ''

         // Strip everything except digits
         const digits = trimmed.replace(/\D/g, '')
         if (!digits) return raw

         // Build dial-code → country map, sorted by dial-length desc for longest-first match.
         const sortedDials = [...new Set(COUNTRIES.map(c => c.dial))]
           .sort((a, b) => b.length - a.length)

         for (const dial of sortedDials) {
           if (digits.startsWith(dial)) {
             // Find first country with this dial (US wins over CA — both dial '1' — by COUNTRIES order)
             const country = COUNTRIES.find(c => c.dial === dial)!
             const localDigits = digits.slice(dial.length).slice(0, maxDigits(country.format))
             if (!localDigits) return raw // dial-only, no local part → don't fake a format
             return `+${dial} ${applyMask(localDigits, country.format)}`
           }
         }

         // No dial match — return raw unchanged
         return raw
       }
       ```

    2. **Create `tests/unit/phone/format.test.ts`**:
       ```typescript
       import { describe, it, expect } from 'vitest'
       import { formatPhoneForDisplay } from '@/lib/phone/format'

       describe('formatPhoneForDisplay', () => {
         it('formats US E.164 → "+1 (508) 301-3010"', () => {
           expect(formatPhoneForDisplay('+15083013010')).toBe('+1 (508) 301-3010')
         })

         it('formats already-formatted US "+1 (508) 301-3010" → same shape', () => {
           expect(formatPhoneForDisplay('+1 (508) 301-3010')).toBe('+1 (508) 301-3010')
         })

         it('formats BR E.164 → "+55 (11) 98765-4321"', () => {
           expect(formatPhoneForDisplay('+5511987654321')).toBe('+55 (11) 98765-4321')
         })

         it('returns raw input unchanged when no dial code matches', () => {
           // No country has dial '999' in COUNTRIES — should pass through.
           expect(formatPhoneForDisplay('+9990001111')).toBe('+9990001111')
         })

         it('returns empty string for empty/null/undefined input', () => {
           expect(formatPhoneForDisplay('')).toBe('')
           expect(formatPhoneForDisplay(null)).toBe('')
           expect(formatPhoneForDisplay(undefined)).toBe('')
         })
       })
       ```

    3. **Apply in `components/pdf/estimate-pdf.tsx`** (and ONLY this file):
       - Add at top: `import { formatPhoneForDisplay } from '@/lib/phone/format'`
       - Two touchpoints. Both inside the `EstimatePDF` function body.

       **(a) Company phone in header (~line 460-464):**
       Current:
       ```tsx
       <Text style={styles.companyContact}>
         {[company.phone, company.email, company.website]
           .filter(Boolean)
           .join('  |  ')}
       </Text>
       ```
       Replace with:
       ```tsx
       <Text style={styles.companyContact}>
         {[formatPhoneForDisplay(company.phone), company.email, company.website]
           .filter(Boolean)
           .join('  |  ')}
       </Text>
       ```

       **(b) Client phone in Bill-To block (~line 515-519):**
       Current:
       ```tsx
       {client.phone && (
         <Text style={[styles.infoValue, { color: '#6b7280' }]}>
           {client.phone}
         </Text>
       )}
       ```
       Replace with:
       ```tsx
       {client.phone && (
         <Text style={[styles.infoValue, { color: '#6b7280' }]}>
           {formatPhoneForDisplay(client.phone)}
         </Text>
       )}
       ```

    Constraints:
    - **DO NOT** apply `formatPhoneForDisplay` anywhere else in the codebase. Scope explicitly excludes share view (`app/estimate/[token]/...`), client list, and any other display location. Grep your final diff: `formatPhoneForDisplay` should appear only in `lib/phone/format.ts`, `tests/unit/phone/format.test.ts`, and `components/pdf/estimate-pdf.tsx`.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/phone/format.test.ts</automated>
  </verify>
  <done>
    - `lib/phone/format.ts` exists with `formatPhoneForDisplay` exported.
    - `tests/unit/phone/format.test.ts` exists; all 5 tests pass.
    - `components/pdf/estimate-pdf.tsx` wraps both `company.phone` and `client.phone` with `formatPhoneForDisplay(...)`.
    - Grep `formatPhoneForDisplay` returns exactly 3 hits: util, test, PDF.
    - `npx tsc --noEmit` is clean.
  </done>
</task>

</tasks>

<verification>
After Task C completes, run the full plan verification:

1. `npx tsc --noEmit` — entire repo type-checks.
2. `npx vitest run tests/unit/phone/format.test.ts` — all 5 cases pass.
3. `npx vitest run` — no other test regresses (touched form files have no existing unit tests, but the global run guards against accidental import-graph breakage).
4. Grep checks:
   - `Grep "from ['\"]@/components/onboarding/phone-input"` → 0 hits (old path retired).
   - `Grep "from ['\"]@/components/ui/phone-input"` → 7 hits (all wired forms + survey phone-step).
   - `Grep "formatPhoneForDisplay"` → exactly 3 hits across `lib/phone/format.ts`, `tests/unit/phone/format.test.ts`, `components/pdf/estimate-pdf.tsx`.
5. Manual spot-check (recommended, not blocking): open `/clients` in dev, edit a client with a saved phone → flag is correct and number is masked. Generate a PDF preview → phone fields render with `+{dial} {masked}` shape.
</verification>

<success_criteria>
- Shared `PhoneInput` lives at `components/ui/phone-input.tsx` and correctly initializes from any incoming `value` shape (E.164, formatted, or plain digits).
- 7 phone-capture surfaces use the shared component; existing form validation and submission contracts are unchanged.
- `formatPhoneForDisplay` is implemented, unit-tested (5/5 cases), and applied ONLY in `components/pdf/estimate-pdf.tsx`.
- `npx tsc --noEmit` clean; `npx vitest run tests/unit/phone/format.test.ts` green.
- No libphonenumber-js or other external phone library introduced (verified by inspecting `package.json` diff — should have zero dependency changes).
- No stored phone data migrated.
</success_criteria>

<output>
After completion, create `.planning/quick/260522-gnx-phone-input-internacional-com-bandeira-f/260522-gnx-SUMMARY.md` summarizing:
- The discovery correction (phone-step.tsx was not actually a PhoneInput consumer)
- The value-init bug that was fixed (component now hydrates flag + masked digits from any incoming value shape)
- The 3 forms that needed adapter stripping (send-form, whatsapp-connect-card, twilio-from-phone-form) due to E.164-strict schemas, vs the 4 that accept the formatted shape natively (client-sheet, company-info-form, step-business-info, phone-step)
- Any deviations from the plan
</output>
