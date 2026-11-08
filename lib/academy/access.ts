import 'server-only'
import { isAcademyAvailable } from './catalog'

/**
 * Whether the signed-in workspace should see the Academy entry point at all.
 * Demo sessions never do; everyone else only when at least one course is
 * visible (see lib/academy/visibility.ts). Cached ~5 minutes inside
 * `getCatalog`, never throws.
 */
export async function academyEntryPointVisible(isDemo: boolean): Promise<boolean> {
  if (isDemo) return false
  // The app shell must never wait on Notion: on a cold cache, give it a short
  // window and otherwise render without the entry point. The load keeps running
  // and fills the cache, so the next navigation shows Academy if it exists.
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), LAYOUT_WAIT_MS)
  })
  try {
    return await Promise.race([isAcademyAvailable(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Longest the app layout waits for the Academy availability check. */
const LAYOUT_WAIT_MS = 1_500
