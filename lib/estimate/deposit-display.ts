// lib/estimate/deposit-display.ts
// PUI-02 (v4.11): the SHARED read seam for deposit / balance-due display across the three
// output surfaces (PDF, public share view, plain-text/WhatsApp/MCP). All renderers call this
// one helper so they cannot drift.
//
// GUARD-03 — TRUST the server's persisted balance_due. This helper READS the persisted row
// (total, balance_due, deposit_type) and NEVER recomputes balance from deposit_value or from
// line items. depositAmount is derived purely as round2(total − balance_due) — the inverse of
// the engine's persisted balanceDue, using the SAME Math.round(x * 100) / 100 byte-discipline
// as compute-totals.ts (do NOT swap to a round2 import).
//
// RETROCOMPAT — deposit_type 'none'/null OR balance_due null (legacy rows) → showDeposit:false,
// depositAmount:0, balanceDue:total. This keeps legacy renders byte-identical.

export interface DepositDisplayRow {
  total: number
  deposit_type: string | null
  deposit_value: number | null
  balance_due: number | null
}

export interface DepositDisplay {
  showDeposit: boolean
  depositAmount: number
  balanceDue: number
}

export function deriveDepositDisplay(row: DepositDisplayRow): DepositDisplay {
  // Retrocompat short-circuit: no deposit configured, or legacy row without a
  // persisted balance_due → hide the deposit lines and treat the full total as
  // the balance due (byte-identical to pre-v4.11 renders).
  if (row.deposit_type == null || row.deposit_type === 'none' || row.balance_due == null) {
    return { showDeposit: false, depositAmount: 0, balanceDue: row.total }
  }

  // Active deposit: depositAmount is the inverse of the server's persisted balanceDue.
  // We TRUST row.balance_due (the authoritative server value) — never re-derive it from
  // deposit_value. Same Math.round(x * 100) / 100 discipline as compute-totals.ts.
  const depositAmount = Math.round((row.total - row.balance_due) * 100) / 100
  return { showDeposit: true, depositAmount, balanceDue: row.balance_due }
}
