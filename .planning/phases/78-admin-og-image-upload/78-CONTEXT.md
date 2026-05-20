# Phase 78: Admin OG Image Upload - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss=true; spec in ROADMAP)

<domain>
## Phase Boundary

Replace the bare `<input type="url">` for OG image in `/admin/seo` with a proper file upload dropzone showing preview + dimension validation, storing the image in Supabase Storage (`branding-assets/og-images/`) and surfacing the resulting URL automatically.

**In scope:**
- New `OgImageUploader` component (mirrors `LogoUploader` pattern)
- 1200×630 aspect-ratio preview frame
- Dimension validation (warn if <600×315, max 2 MB)
- Upload via `storage.upload()` to `branding-assets/og-images/{ts}-{name}`
- Remove button with confirmation + best-effort storage cleanup
- Backward-compat: if `og_image_url` is external (not in branding-assets), keep working + show migration hint

**Out of scope:**
- Drag-from-other-tab support
- Image cropping UI in-app (user pre-crops; future seed if requested)
- Multiple OG image variants (per locale, per page) — single global for now

</domain>

<decisions>
## Implementation Decisions (locked)

### Component pattern
- Mirror `components/onboarding/logo-uploader.tsx` — same look + behavior (preview tile, change/remove buttons)
- File: `components/admin/og-image-uploader.tsx`
- Props: `{ currentUrl, onUpload(url), onRemove() }`

### Validation
- Accept: `image/png`, `image/jpeg` only (no SVG — OG images render in social cards that don't all support SVG well)
- Max size: 2 MB (client + server check)
- Dimensions: read via `<img>` load + `naturalWidth/Height`
  - Ideal: 1200×630 (Facebook/Twitter card spec)
  - Warn (red text, not blocking): <600×315
  - Show detected dimensions in UI

### Storage path
- Bucket: `branding-assets` (already exists for logos? researcher to confirm)
- Path: `og-images/{Date.now()}-{sanitized-filename}.{ext}`
- Public URL via `storage.getPublicUrl()` or signed-URL pattern matching existing logos

### Remove behavior
- AlertDialog confirmation ("This will remove the OG image from search/social previews. Continue?")
- On confirm: clear `og_image_url` to null in `platform_branding`
- Best-effort delete the storage object (don't fail UI if storage delete errors)
- Toast feedback both success + error

### Backward compat
- If `og_image_url` exists but isn't in `branding-assets/og-images/` (external URL or pre-migration self-hosted): still render preview (use `<img>` loadable check)
- Show hint banner: "Currently using external URL. Upload a managed image to better track usage."

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/onboarding/logo-uploader.tsx` — pattern to mirror
- `lib/storage/index.ts` — `storage.upload()` + `storage.getSignedUrl()` API
- `components/ui/alert-dialog.tsx` — for remove confirmation (added in Phase 76)
- `app/admin/seo/seo-editor.tsx` — the existing form to modify
- `app/admin/seo/actions.ts` — server action for saveSeo (likely)

### Integration Points
- Replace `<Input type="url" name="og_image_url" />` in `seo-editor.tsx` with `<OgImageUploader>`
- Wire `onUpload` to set form field; `onRemove` to clear it

</code_context>

<specifics>
## Specific Ideas

**Plan structure (estimated 2 plans):**
- 78-01: `OgImageUploader` component + dimension validation + integration with SEO form
- 78-02: Server-side accept/reject + storage delete + AlertDialog wire + tests + closeout

</specifics>
