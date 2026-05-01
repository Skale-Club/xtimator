# Phase 13 Icon Smoke Checklist

1. Run `npm test -- --run tests/unit/app-icons.test.ts && npm run build` and confirm both commands pass before checking any browser surface.
2. Run `npm run dev` and keep the app available at `http://localhost:9633/` for the rest of the smoke pass.
3. Open `http://localhost:9633/` in a desktop browser and confirm the tab favicon shows the new blue X monogram instead of a blank, default, or stale placeholder icon.
4. Open `http://localhost:9633/favicon.ico`, `http://localhost:9633/icon`, `http://localhost:9633/apple-icon`, and `http://localhost:9633/manifest.webmanifest` directly; each route must return a 200 response and must not redirect to login.
5. Inspect the page in DevTools Elements and confirm there is one framework-generated favicon stack with no manual duplicate `<link rel="icon">` or `<link rel="apple-touch-icon">` entries.
6. In iOS Safari, open `http://localhost:9633/`, use Share > Add to Home Screen, and confirm the preview icon matches the same blue monogram.
7. In Android Chrome, open `http://localhost:9633/`, inspect the install or Add to Home Screen preview, and confirm it uses the same blue monogram.
8. Record pass/fail notes for every checked surface; if anything fails, capture the exact surface, URL, and mismatch description (wrong icon, missing icon, duplicate icon links, or login redirect).
