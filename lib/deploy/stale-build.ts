'use client'

/**
 * Recovering an autosave editor across a deploy (QA 2026-11-19).
 *
 * Server Action ids change with every build. A page opened before a deploy
 * keeps calling the OLD ids, the new container answers 404, and every
 * autosave fails: an open estimate or change order editor said "Not saved"
 * and everything typed after the deploy was lost on reload. `deploymentId`
 * (next.config.ts) only hard-reloads on NAVIGATION, never for an action
 * fired from a page that is already open.
 *
 * When a save fails and a newer build is live, the editor stashes its draft in
 * sessionStorage (per tab, survives a reload) and reloads. On mount, the editor
 * takes the draft back - only when the server copy is still the one the draft
 * was based on - and the new build saves it.
 */

const KEY_PREFIX = 'xtimator:stale-draft:'
/** A draft older than this is ignored (it was abandoned, not in flight). */
const MAX_AGE_MS = 60 * 60 * 1000

type Stash<T> = { baseUpdatedAt: string; data: T; at: number }

let reloadingForNewBuild = false

/** True once a draft was stashed for a reload: beforeunload guards let it pass. */
export function isReloadingForNewBuild(): boolean {
  return reloadingForNewBuild
}

/** The build this page was loaded from (next.config.ts deploymentId = git SHA). */
export function currentBuildId(): string | null {
  const id = process.env.NEXT_DEPLOYMENT_ID
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
}

/** True when /api/health reports a different commit than this page's build. */
export async function newerBuildIsLive(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const current = currentBuildId()
  if (!current) return false
  try {
    const res = await fetchImpl('/api/health', { cache: 'no-store' })
    if (!res.ok) return false
    const body = (await res.json()) as { commit?: unknown }
    return typeof body.commit === 'string' && body.commit !== '' && body.commit !== current
  } catch {
    return false
  }
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function stashDraft<T>(key: string, baseUpdatedAt: string, data: T): boolean {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(KEY_PREFIX + key, JSON.stringify({ baseUpdatedAt, data, at: Date.now() } satisfies Stash<T>))
    return true
  } catch {
    return false
  }
}

/**
 * Take (and remove) a stashed draft. Returns it only when it was based on the
 * server copy the editor just loaded (`baseUpdatedAt`) and is recent; a draft
 * based on an older copy would overwrite someone else's save, so it is dropped.
 */
export function takeDraft<T>(key: string, baseUpdatedAt: string): T | null {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY_PREFIX + key)
    if (!raw) return null
    s.removeItem(KEY_PREFIX + key)
    const stash = JSON.parse(raw) as Stash<T>
    if (stash.baseUpdatedAt !== baseUpdatedAt) return null
    if (typeof stash.at !== 'number' || Date.now() - stash.at > MAX_AGE_MS) return null
    return stash.data
  } catch {
    return null
  }
}

/**
 * Call after a failed save. When a newer build is live, stashes the draft and
 * reloads the page (returns true: the caller stops handling the failure).
 * Otherwise returns false and the caller shows its normal error.
 */
export async function recoverFromStaleBuild<T>(
  key: string,
  baseUpdatedAt: string,
  data: T,
  opts: { reload?: () => void; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  if (!(await newerBuildIsLive(opts.fetchImpl))) return false
  if (!stashDraft(key, baseUpdatedAt, data)) return false
  reloadingForNewBuild = true
  ;(opts.reload ?? (() => window.location.reload()))()
  return true
}
