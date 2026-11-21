/**
 * Custom project order: pure position math shared by the server action
 * (lib/actions/project-order.ts) and the optimistic client update
 * (components/projects/project-table.tsx). Lower sort_order = higher in the list.
 */

/** Neighbours closer than this are renumbered before a midpoint is taken. */
export const MIN_SORT_GAP = 1e-6

/**
 * The sort_order a moved project takes between its two neighbours.
 * `undefined` = no neighbour on that side (top or bottom of the list);
 * `null` = a neighbour exists but has no sort_order yet.
 * Returns null when there is no usable answer (no neighbour at all, a missing
 * value, a gap under MIN_SORT_GAP or neighbours out of order): the caller
 * renumbers first.
 */
export function computeMovedSortOrder(
  above: number | null | undefined,
  below: number | null | undefined,
): number | null {
  if (above === undefined && below === undefined) return null
  if (above === null || below === null) return null
  if (above !== undefined && below !== undefined) {
    if (!(below - above >= MIN_SORT_GAP)) return null
    return (above + below) / 2
  }
  if (above !== undefined) return above + 1
  return (below as number) - 1
}
