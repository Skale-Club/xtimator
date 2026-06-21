---
status: complete
---

# Harmonize how-it-works card line thickness

## Completed

- Measured the three "How it works" card animations as actually rendered in the browser (desktop, ~329px card column): audio waveform bars render at **2.88px**, while the camera and speech-bubble outline strokes rendered at **1.43px** — half as thick. Cause: the SVGs use different viewBoxes and scaling (waveform width-constrained ×0.823; camera/balloon height-constrained ×0.716).
- Raised the camera outline group `strokeWidth` from `2` → `4` (`<g>` covering the body path, 2 horizontal stripes, 2 lens rings).
- Raised the speech-bubble outline `path` `strokeWidth` from `2` → `4`.
- Left the filled elements untouched: waveform bar width (3.5), bubble typing-dot radius (11.7), camera lens glass disc stroke, and flash rect.

## Verification

- Browser re-measurement at 1440×900 (`mcp__Claude_Preview__preview_eval`): waveform **2.88px**, bubble **2.86px**, camera **2.86px** — strokes now match the bars within 0.02px.
- `4 × 0.716 = 2.86px ≈ 2.88px` confirmed.
- No console errors after the change.

## Files

- `components/landing/how-it-works-section.tsx` — two `strokeWidth` attribute changes (`CameraBackground` group, `SpeechBubbleBackground` path).
