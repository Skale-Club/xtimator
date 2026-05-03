'use client'

// Patch console.error at module-load time (before React hydration).
// React 19 warns about <script> elements in JSX because it now treats them as
// hoisted resources. next-themes v0.4.x injects an inline script for SSR FOUC
// prevention — correct behaviour, but triggers this cosmetic warning during
// client hydration. The script already ran during SSR; there is no functional
// impact. Remove once next-themes ships React 19-native resource APIs.
if (typeof window !== 'undefined') {
  const orig = console.error.bind(console)
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Encountered a script tag while rendering')
    ) return
    orig(...args)
  }
}

export function SuppressWarnings() {
  return null
}
