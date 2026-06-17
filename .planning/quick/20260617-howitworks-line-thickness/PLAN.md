# Harmonize how-it-works card line thickness

Task: Make the camera and speech-bubble outline strokes render at the same on-screen thickness as the audio waveform bars in the "How it works" cards.

## Measured problem (browser, desktop ~329px column)

| Animation | Element | viewBox | raw | scale | rendered |
|---|---|---|---|---|---|
| Audio waveform | filled bars `width=3.5` | 400×150 | 3.5 | ×0.823 | **2.88px** |
| Speech bubble | `strokeWidth=2` | 260×190 | 2 | ×0.716 | 1.43px |
| Camera | `strokeWidth=2` | 260×190 | 2 | ×0.716 | 1.43px |

The waveform is width-constrained; camera/balloon are height-constrained (fixed 136px). Net: bars render 2× thicker than the strokes.

## Fix

`components/landing/how-it-works-section.tsx`:
- Camera outline group `<g ... strokeWidth="2">` → `strokeWidth="4"` (body path, 2 stripes, 2 lens rings)
- Speech-bubble outline `<path ... strokeWidth="2" ...>` → `strokeWidth="4"`

4 × 0.716 = 2.86px ≈ waveform's 2.88px ✓

## Do NOT change

- Filled lens disc stroke (`circle ... strokeWidth="2"` — filled glass, not a line)
- Filled flash rect
- Waveform bar width (3.5)
- Bubble typing-dot radius (11.7)
