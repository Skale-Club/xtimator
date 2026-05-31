export const PLACEHOLDER_PREFIX = 'Untitled project — '

/**
 * True when a project name is still the auto-generated placeholder
 * (e.g. "Untitled project — 5/31/2026"). Used to decide whether to show
 * a rename nudge or treat the project as named by the user.
 */
export function isPlaceholderName(name: string): boolean {
  return name.startsWith(PLACEHOLDER_PREFIX)
}
