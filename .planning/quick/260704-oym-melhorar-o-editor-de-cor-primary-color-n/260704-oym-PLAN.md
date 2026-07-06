---
phase: quick
plan: 260704-oym
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - app/admin/branding/branding-editor.tsx
  - components/admin/primary-color-picker.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Clicking the primary color swatch opens a custom popover styled for the admin dark theme (not the native OS/browser color picker)"
    - "The popover shows a saturation/hue gradient picker plus a hue slider"
    - "User can type a hex value directly and see it reflected in the swatch, gradient picker position, and BrandingPreviewCard"
    - "Picking a color in the gradient picker updates the hex input and BrandingPreviewCard live"
  artifacts:
    - path: "components/admin/primary-color-picker.tsx"
      provides: "Popover-based custom color picker wrapping react-colorful's HexColorPicker, with hex/preview row and swatch trigger"
      min_lines: 40
    - path: "app/admin/branding/branding-editor.tsx"
      provides: "primaryColor FormField now renders PrimaryColorPicker instead of native input[type=color]"
    - path: "package.json"
      provides: "react-colorful dependency"
      contains: "react-colorful"
  key_links:
    - from: "app/admin/branding/branding-editor.tsx"
      to: "components/admin/primary-color-picker.tsx"
      via: "import + render inside primaryColor FormField"
      pattern: "PrimaryColorPicker"
    - from: "components/admin/primary-color-picker.tsx"
      to: "react-colorful"
      via: "HexColorPicker import"
      pattern: "from ['\"]react-colorful['\"]"
    - from: "components/admin/primary-color-picker.tsx"
      to: "components/ui/popover.tsx"
      via: "Popover/PopoverTrigger/PopoverContent"
      pattern: "from ['\"]@/components/ui/popover['\"]"
---

<objective>
Replace the native `<input type="color">` used for "Primary color" in the admin Branding editor with a custom color picker that matches the admin dark theme: a clickable swatch button that opens a shadcn Popover containing a react-colorful saturation/hue gradient picker, plus the existing hex text input alongside it.

Purpose: The native OS/browser color picker (square gradient + hue slider + eyedropper + RGB inputs) cannot be styled and looks jarringly out of place against the admin panel's dark theme. A custom popover-based picker gives full visual control while keeping the same `primaryColor` form field contract.

Output: New `components/admin/primary-color-picker.tsx` component; `app/admin/branding/branding-editor.tsx` updated to use it in place of the raw `<input type="color">`; `react-colorful` added to `package.json`/`package-lock.json`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/admin/branding/branding-editor.tsx
@components/ui/popover.tsx
@lib/system-colors.ts

# Reference pattern only — do NOT copy verbatim (no gradient, preset-swatch grid style):
@components/onboarding/color-picker.tsx
</context>

<interfaces>
<!-- Existing shadcn Popover primitives (components/ui/popover.tsx) — use directly, no exploration needed -->

```typescript
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription }
```

`PopoverContent` renders via `PopoverPrimitive.Portal`, default classes: `z-50 w-72 ... rounded-md border bg-popover p-4 text-popover-foreground shadow-md`. Accepts `className` override, `align` (default `"center"`), `sideOffset` (default `4`).

<!-- react-colorful API (stable, minimal — no docs lookup needed) -->

```typescript
import { HexColorPicker } from "react-colorful";
// <HexColorPicker color={hexString} onChange={(newHex: string) => void} />
```

Renders the saturation/hue gradient square plus a hue slider. No built-in hex input or
swatch — pair with the existing hex `<Input>` in branding-editor.tsx for text entry.
react-colorful auto-injects its own base CSS on import (no separate stylesheet import
needed). Default styling targets light backgrounds (white pointer ring, thin hue bar),
so it will need dark-theme touches. Target its documented, stable class names with
Tailwind arbitrary-variant selectors on a wrapper div: `.react-colorful`,
`.react-colorful__saturation`, `.react-colorful__hue`, `.react-colorful__pointer`.

<!-- BrandingEditor's current primaryColor field (app/admin/branding/branding-editor.tsx:179-209) — the exact contract PrimaryColorPicker must fit into -->

```tsx
<FormField
  control={form.control}
  name="primaryColor"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t('Primary color')}</FormLabel>
      <div className="flex items-center gap-3">
        <FormControl>
          {/* replace native input[type=color] with: */}
          {/* <PrimaryColorPicker value={field.value || DEFAULT_COLOR} onChange={field.onChange} /> */}
        </FormControl>
        <Input
          type="text"
          className="w-32 font-mono"
          value={field.value ?? ''}
          onChange={field.onChange}
          placeholder={DEFAULT_COLOR}
          autoComplete="off"
        />
      </div>
      <FormDescription>{t('Accents buttons and focus rings on auth pages and admin tools.')}</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

`field.onChange` accepts a raw string when called directly (e.g. `field.onChange('#ABCDEF')`)
— this pattern is already used in this file for the hex `<Input>`. So `PrimaryColorPicker`'s
`onChange` prop should be typed `(hex: string) => void`, and the caller passes `field.onChange`
directly (RHF's `onChange` accepts a raw value, not just a change event).
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add react-colorful dependency</name>
  <files>package.json, package-lock.json</files>
  <action>
    Run `npm install react-colorful@^5.6.1` (latest stable 5.x; accept whatever npm resolves
    within that major). This updates `package.json` dependencies and `package-lock.json`.
    Do NOT touch pnpm-lock.yaml or any other lockfile — this project's active lockfile is
    `package-lock.json` per CLAUDE.md/project convention.

    Confirm no peer dependency conflicts are reported (react-colorful supports React 16.8+,
    compatible with React 19 used here).
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(!p.dependencies['react-colorful']) process.exit(1)"</automated>
  </verify>
  <done>`react-colorful` appears in `package.json` dependencies and `node_modules/react-colorful` exists after install.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Build PrimaryColorPicker component (Popover + react-colorful)</name>
  <files>components/admin/primary-color-picker.tsx</files>
  <action>
    Create a new client component `components/admin/primary-color-picker.tsx` exporting `PrimaryColorPicker`:

    ```typescript
    interface PrimaryColorPickerProps {
      value: string
      onChange: (hex: string) => void
    }
    export function PrimaryColorPicker({ value, onChange }: PrimaryColorPickerProps): JSX.Element
    ```

    Structure:
    - `'use client'` directive at top.
    - Import `HexColorPicker` from `react-colorful`.
    - Import `Popover, PopoverTrigger, PopoverContent` from `@/components/ui/popover`.
    - Render a `PopoverTrigger asChild` wrapping a `<button type="button">` swatch — same
      visual footprint as the current native input (`h-10 w-10 rounded border border-border
      cursor-pointer`), with `style={{ backgroundColor: value }}` and
      `aria-label="Pick primary color"` (no visible text on the swatch itself).
    - `PopoverContent` with `className="w-auto p-3"` (override the default `w-72` so it hugs
      react-colorful's ~200px picker instead of stretching it), containing:
      - `<HexColorPicker color={value} onChange={onChange} />`
      - Below it, a small preview row: a rounded swatch (`h-6 w-6 rounded border
        border-border`) with `style={{ backgroundColor: value }}` plus the current hex
        string in muted monospace text (`<span className="font-mono text-xs
        text-muted-foreground">{value}</span>`) — this is the "preview of the current
        color" requirement, distinct from the separate hex `<Input>` that already lives
        beside the swatch in `branding-editor.tsx`.
    - Dark-theme fit: wrap the `HexColorPicker` in a `div` whose `className` applies Tailwind
      arbitrary-variant overrides targeting react-colorful's class hooks, e.g.:
      `"[&_.react-colorful]:w-full [&_.react-colorful__saturation]:rounded-md
      [&_.react-colorful__hue]:rounded-md [&_.react-colorful__hue]:mt-2
      [&_.react-colorful__pointer]:h-4 [&_.react-colorful__pointer]:w-4"`.
      Adjust these in Task 3 if the picker still looks visually off against `bg-popover`
      during manual browser verification — no `globals.css` edits needed for this scope.
    - Do not add a preset-swatch grid — that pattern belongs to
      `components/onboarding/color-picker.tsx`, which is out of scope and must not be modified.

    Keep the component self-contained: no dependency on `SYSTEM_COLORS` needed, since
    `value`/`onChange` are passed in by the caller (branding-editor.tsx already resolves
    `field.value || DEFAULT_COLOR`).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "primary-color-picker" ; test $? -ne 0</automated>
  </verify>
  <done>File exists, exports `PrimaryColorPicker`, compiles with no TypeScript errors, and the swatch button + Popover + HexColorPicker + hex/preview row are all present.</done>
</task>

<task type="auto">
  <name>Task 3: Wire PrimaryColorPicker into BrandingEditor and visually verify</name>
  <files>app/admin/branding/branding-editor.tsx</files>
  <action>
    In `app/admin/branding/branding-editor.tsx`:
    1. Add import: `import { PrimaryColorPicker } from '@/components/admin/primary-color-picker'`
    2. In the `primaryColor` FormField (lines ~179-209), replace the
       `<FormControl><input type="color" ... /></FormControl>` block with:
       ```tsx
       <FormControl>
         <PrimaryColorPicker
           value={field.value || DEFAULT_COLOR}
           onChange={field.onChange}
         />
       </FormControl>
       ```
       Keep the adjacent hex `<Input>` exactly as-is (already correct, per scope — "Campo de
       hex... manter").
    3. Do not modify `components/settings/company-info-form.tsx` or
       `components/app-shell/admin-create-company-modal.tsx` — out of scope.

    After the edit, start the dev server (or reuse a running one) and manually verify in the browser:
    - Navigate to `/admin/branding`.
    - Click the swatch — confirm a Popover opens (not the native OS picker), styled
      consistent with the dark admin theme (`bg-popover`/`border` tokens, not a jarring
      white box).
    - Confirm the saturation/hue gradient + hue slider render and are draggable, updating
      the hex text beside the picker and the swatch color.
    - Type a hex value into the existing hex `<Input>` next to the swatch — confirm the
      picker's gradient position and swatch update to match.
    - Confirm `BrandingPreviewCard` (the right column) updates its "Sign in" button color
      and admin-nav active-item accent live as the color changes.
    - Confirm no console errors/warnings related to react-colorful or the popover.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>Native `input[type=color]` is gone from branding-editor.tsx; PrimaryColorPicker is rendered in its place; TypeScript compiles clean; manual browser check confirms the popover opens styled for dark theme, accepts hex typing, and BrandingPreviewCard updates live.</done>
</task>

</tasks>

<verification>
- `grep -c "type=\"color\"" app/admin/branding/branding-editor.tsx` returns 0 (native color input fully removed from this file).
- `grep -c "react-colorful" package.json` returns 1+.
- `npx tsc --noEmit` passes with no new errors.
- Manual browser check (Task 3) confirms the popover-based picker replaces the native picker and live-updates the preview.
- `components/settings/company-info-form.tsx` and `components/app-shell/admin-create-company-modal.tsx` remain untouched (`git diff --stat` shows no changes to these files).
</verification>

<success_criteria>
- Clicking the "Primary color" swatch on `/admin/branding` opens a custom-styled Popover (not the native browser/OS color picker).
- The Popover contains a react-colorful saturation/hue gradient picker and hue slider that visually fit the admin dark theme.
- The existing hex text input still works and stays in sync with the new gradient picker (either input updates the other).
- `BrandingPreviewCard` continues to update live as the color changes.
- The other two native `input[type=color]` usages (`company-info-form.tsx`, `admin-create-company-modal.tsx`) are untouched.
- `react-colorful` is a declared dependency in `package.json`/`package-lock.json`.
</success_criteria>

<output>
After completion, create `.planning/quick/260704-oym-melhorar-o-editor-de-cor-primary-color-n/260704-oym-SUMMARY.md`
</output>
