import { TowerLoader } from '@/components/ui/tower-loader'

/**
 * Dev-only visual test page for the 3D tower loader.
 * Renders the project's <TowerLoader> next to a VERBATIM copy of the original
 * Uiverse reference (csozidev/weak-bulldog-22) so the two can be compared
 * frame by frame. Safe to delete — nothing imports this route.
 */

// Original CSS, exactly as published on uiverse.io, scoped under .uiverse-ref
// so its generic class names (.loader, .box) can't leak into the app.
const REFERENCE_CSS = `
.uiverse-ref .loader {
  scale: 3;
  height: 50px;
  width: 40px;
}
.uiverse-ref .box {
  position: relative;
  opacity: 0;
  left: 10px;
}
.uiverse-ref .side-left {
  position: absolute;
  background-color: #286cb5;
  width: 19px;
  height: 5px;
  transform: skew(0deg, -25deg);
  top: 14px;
  left: 10px;
}
.uiverse-ref .side-right {
  position: absolute;
  background-color: #2f85e0;
  width: 19px;
  height: 5px;
  transform: skew(0deg, 25deg);
  top: 14px;
  left: -9px;
}
.uiverse-ref .side-top {
  position: absolute;
  background-color: #5fa8f5;
  width: 20px;
  height: 20px;
  rotate: 45deg;
  transform: skew(-20deg, -20deg);
}
.uiverse-ref .box-1 { animation: uiverse-from-left 4s infinite; }
.uiverse-ref .box-2 { animation: uiverse-from-right 4s infinite; animation-delay: 1s; }
.uiverse-ref .box-3 { animation: uiverse-from-left 4s infinite; animation-delay: 2s; }
.uiverse-ref .box-4 { animation: uiverse-from-right 4s infinite; animation-delay: 3s; }
@keyframes uiverse-from-left {
  0%   { z-index: 20; opacity: 0; translate: -20px -6px; }
  20%  { z-index: 10; opacity: 1; translate: 0px 0px; }
  40%  { z-index: 9;  translate: 0px 4px; }
  60%  { z-index: 8;  translate: 0px 8px; }
  80%  { z-index: 7;  opacity: 1; translate: 0px 12px; }
  100% { z-index: 5;  translate: 0px 30px; opacity: 0; }
}
@keyframes uiverse-from-right {
  0%   { z-index: 20; opacity: 0; translate: 20px -6px; }
  20%  { z-index: 10; opacity: 1; translate: 0px 0px; }
  40%  { z-index: 9;  translate: 0px 4px; }
  60%  { z-index: 8;  translate: 0px 8px; }
  80%  { z-index: 7;  opacity: 1; translate: 0px 12px; }
  100% { z-index: 5;  translate: 0px 30px; opacity: 0; }
}
`

function ReferenceLoader() {
  return (
    <div className="uiverse-ref">
      <div className="loader">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`box box-${i}`}>
            <div className="side-left" />
            <div className="side-right" />
            <div className="side-top" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LoaderDevPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8 space-y-12">
      <style dangerouslySetInnerHTML={{ __html: REFERENCE_CSS }} />

      <header>
        <h1 className="text-xl font-bold">Tower loader — visual test</h1>
        <p className="text-sm text-muted-foreground">
          Left: verbatim Uiverse original (csozidev/weak-bulldog-22, scale 3).
          Right: project&apos;s <code>&lt;TowerLoader size=&#123;3&#125;/&gt;</code>.
          They must look identical.
        </p>
      </header>

      {/* Side-by-side @ scale 3 — generous fixed boxes so scale-3 content can't clip */}
      <section className="flex flex-wrap gap-8">
        <figure className="flex flex-col items-center gap-4 rounded-xl border p-6">
          <div className="flex h-[220px] w-[220px] items-center justify-center">
            <ReferenceLoader />
          </div>
          <figcaption className="text-sm text-muted-foreground">Original (uiverse)</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-4 rounded-xl border p-6">
          <div className="flex h-[220px] w-[220px] items-center justify-center">
            <TowerLoader size={3} />
          </div>
          <figcaption className="text-sm text-muted-foreground">TowerLoader size=3</figcaption>
        </figure>
      </section>

      {/* Size sweep — footprint boxes get a border so overflow is visible */}
      <section className="space-y-3">
        <h2 className="font-semibold">Sizes (border = reserved layout footprint)</h2>
        <div className="flex flex-wrap items-end gap-6">
          {[1, 1.5, 1.8, 2.5].map((s) => (
            <figure key={s} className="flex flex-col items-center gap-2">
              <div className="border border-dashed border-muted-foreground/40">
                <TowerLoader size={s} />
              </div>
              <figcaption className="text-xs text-muted-foreground">size={s}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* In-context: replica of the capture processing overlay (dark dialog) */}
      <section className="space-y-3">
        <h2 className="font-semibold">In context — capture overlay replica (dark)</h2>
        <div className="dark relative h-[300px] max-w-md overflow-hidden rounded-xl border bg-[#0b0f17]">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <TowerLoader size={1.8} label="Loading" />
            <div className="flex w-full max-w-[240px] gap-1.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full rounded-full bg-blue-500" />
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 rounded-full bg-blue-500" />
              </div>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" />
            </div>
            <p className="text-sm text-neutral-400">Transcribing</p>
          </div>
        </div>
      </section>
    </main>
  )
}
