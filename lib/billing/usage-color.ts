/**
 * Phase 156 (CREDITFIX-02) — shared color-escalation helper.
 *
 * Extracted from components/billing/usage-progress-bar.tsx (Phase 152) so the
 * new CreditChip topbar bar reuses the EXACT SAME thresholds instead of
 * duplicating the if/else. Pure extraction, not a redesign.
 *
 * Bands: 0-69% healthy (green/--success), 70-89% warning (amber/--warning),
 * 90-100% critical (red/--danger).
 */
export function usageBandClass(percentUsed: number): string {
  if (percentUsed >= 90) return '[&>[data-slot=progress-indicator]]:bg-[hsl(var(--danger))]'
  if (percentUsed >= 70) return '[&>[data-slot=progress-indicator]]:bg-[hsl(var(--warning))]'
  return '[&>[data-slot=progress-indicator]]:bg-[hsl(var(--success))]'
}
