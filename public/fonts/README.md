# Vendored PDF Fonts

TrueType font files used by `lib/pdf/register-fonts.ts` (`Font.register`) so
`@react-pdf/renderer` can embed real, correctly-hinted glyphs in generated
PDFs instead of falling back to its built-in AFM fonts (Helvetica /
Times-Roman), which do not match the fonts the web app actually renders.

These files live under `public/` (not `assets/` or another top-level
directory) because only `public/`, `.next/standalone`, and `.next/static`
survive the Docker multi-stage build into the final `runner` image (see
`Dockerfile`'s runner stage `COPY --from=builder ... /app/public ./public`).
A font directory outside `public/` would build fine locally but be silently
missing in the deployed container.

## Inter (Classic template — sans-serif)

- **Version:** v20
- **Vendored:** 2026-07-28
- **License:** SIL Open Font License 1.1 — full text in `inter/OFL.txt`
- **Source URLs** (Google Fonts' serving CDN):
  - Regular 400: https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf
  - Bold 700: https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf
  - License: https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt

Inter is the same family the web app renders via `next/font/google` in
`app/layout.tsx` — vendoring it for the PDF closes the font-parity gap
between the webview and the Classic PDF template.

## Lora (Modern template — serif)

- **Version:** v37
- **Vendored:** 2026-07-28
- **License:** SIL Open Font License 1.1 — full text in `lora/OFL.txt`
- **Source URLs** (Google Fonts' serving CDN):
  - Regular 400: https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuxJBkqg.ttf
  - Bold 700: https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787z5vBJBkqg.ttf
  - License: https://raw.githubusercontent.com/google/fonts/main/ofl/lora/OFL.txt

## Why gstatic.com and not the `google/fonts` GitHub source repo directly

Both families' GitHub source files are variable-axis fonts (`[wght].ttf`)
with no static per-weight instances. `Font.register` (via react-pdf's
`fontkit`) needs a static, single-weight TTF per registered family name —
gstatic's CDN serves exactly that: the same pre-instantiated static-weight
font-face byte streams a real browser downloads when it requests these
families from Google Fonts. The license text is sourced from the
`google/fonts` GitHub repo (the canonical OFL text location) even though the
font binaries themselves come from gstatic.
