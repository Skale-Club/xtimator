/**
 * Modal URL helpers — toggle the `modal` search param via the native History
 * API instead of router.push/replace.
 *
 * Why: opening a modal is purely client state (a Dialog reads `useSearchParams`
 * to flip `isOpen`). Using `router.push(?modal=…)` forces Next.js to fetch a
 * fresh RSC payload and re-render the current page before the navigation
 * transition commits — and `useSearchParams` only updates on commit, so on a
 * heavy page the modal can't even appear until the server responds.
 *
 * `window.history.pushState`/`replaceState` integrate with the Next.js Router
 * (supported alongside useSearchParams since 14.1), so the param — and thus the
 * dialog — updates instantly with zero server round-trip. The page behind the
 * modal doesn't need to change, so skipping its re-render is exactly right.
 */

function mutateUrl(
  mutate: (params: URLSearchParams) => void,
  mode: 'push' | 'replace',
): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  mutate(url.searchParams)
  const search = url.searchParams.toString()
  const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
  if (mode === 'push') window.history.pushState(null, '', next)
  else window.history.replaceState(null, '', next)
}

/** Open a modal by setting `?modal=<value>` (preserves other params). */
export function openModalParam(value: string): void {
  mutateUrl((params) => params.set('modal', value), 'push')
}

/**
 * Close the current modal by removing `modal` (plus any extra params the modal
 * owns, e.g. `editProjectId`). Uses replaceState so closing doesn't leave an
 * extra history entry.
 */
export function closeModalParam(...extraKeys: string[]): void {
  mutateUrl((params) => {
    params.delete('modal')
    for (const key of extraKeys) params.delete(key)
  }, 'replace')
}
