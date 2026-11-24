/**
 * Compatibility boundaries for the existing business-event fixture suites.
 * These deliberately reuse their insert/delete spies; lease/RPC semantics and
 * real SDK signatures have separate tests rather than being inferred here.
 */
type Result = { error?: { code?: string; message?: string } | null }
type LegacyDb = {
  from(table: string): {
    insert(row: { event_id: string }): PromiseLike<Result>
    delete(): { eq(column: string, value: string): PromiseLike<Result> }
  }
}

export function legacyStripeInboxBoundary() {
  return {
    async claimStripeEvent(db: LegacyDb, event: { id: string }) {
      const { error } = await db.from('processed_stripe_events').insert({ event_id: event.id })
      if (error?.code === '23505') return { state: 'completed' as const }
      if (error) throw new Error(error.message ?? 'Fixture event claim failed')
      return { state: 'acquired' as const, token: 'fixture-lease-token' }
    },
    async finishStripeEvent(db: LegacyDb, id: string, _token: string, success: boolean) {
      if (success) return
      const { error } = await db.from('processed_stripe_events').delete().eq('event_id', id)
      if (error) throw new Error(error.message ?? 'Fixture event retry release failed')
    },
  }
}

/** Old business fixtures carry explicit legacy links/totals, without API reads. */
export function legacyStripeRefundBoundary() {
  return {
    resolveChargeInvoiceId: async (charge: { invoice?: string | { id: string } | null }) =>
      typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id ?? null,
    successfulRefundedCents: async (charge: { amount_refunded?: number }) => charge.amount_refunded ?? 0,
    successfulInvoiceRefundedCents: async () => undefined,
  }
}
