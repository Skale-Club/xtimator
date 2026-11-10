/**
 * Minimal in-memory stand-in for the supabase-js query builder, just enough for the
 * messaging cost tests (select / update / insert with eq, is, not, gt, gte, in, or,
 * limit, maybeSingle). Rows are plain objects; update applies atomically to the rows
 * that match at call time, which is what the debit job's claim relies on.
 */
export type Row = Record<string, unknown>

export function makeFakeDb(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(initial)) tables[name] = rows.map((r) => ({ ...r }))
  const log: Array<{ table: string; op: string; payload?: Row }> = []

  function table(name: string): Row[] {
    return (tables[name] ??= [])
  }

  function from(name: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: 'select' | 'update' | 'insert' = 'select'
    let patch: Row = {}
    let inserted: Row | null = null
    let returnRows = false
    let single = false

    const api: Record<string, unknown> = {
      select() {
        if (op === 'update') returnRows = true
        return api
      },
      update(p: Row) {
        op = 'update'
        patch = p
        return api
      },
      insert(row: Row) {
        op = 'insert'
        inserted = row
        return api
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val)
        return api
      },
      neq(col: string, val: unknown) {
        filters.push((r) => r[col] !== val)
        return api
      },
      is(col: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] == null : r[col] === val))
        return api
      },
      not(col: string, _op: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] != null : r[col] !== val))
        return api
      },
      gt(col: string, val: number) {
        filters.push((r) => r[col] != null && Number(r[col]) > val)
        return api
      },
      gte(col: string, val: string) {
        filters.push((r) => r[col] != null && String(r[col]) >= val)
        return api
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]))
        return api
      },
      or(expr: string) {
        const parts = expr.split(',').map((p) => p.split('.'))
        filters.push((r) =>
          parts.some(([col, o, v]) => (o === 'eq' ? r[col] === v : o === 'neq' ? r[col] !== v : false))
        )
        return api
      },
      limit() {
        return api
      },
      maybeSingle() {
        single = true
        return api
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(execute()).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(resolve, reject)
        }
      },
    }

    function execute() {
      const rows = table(name)
      if (op === 'insert') {
        const row = inserted as Row
        if (
          name === 'messaging_cost_events' &&
          row.provider_message_id != null &&
          rows.some((r) => r.provider === row.provider && r.provider_message_id === row.provider_message_id)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        rows.push({ id: `row-${rows.length + 1}`, debited_at: null, debit_batch_id: null, ...row })
        log.push({ table: name, op: 'insert', payload: row })
        return { data: null, error: null }
      }
      const matches = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        log.push({ table: name, op: 'update', payload: patch })
        for (const r of matches) Object.assign(r, patch)
        return { data: returnRows ? matches.map((r) => ({ ...r })) : null, error: null }
      }
      if (single) return { data: matches[0] ? { ...matches[0] } : null, error: null }
      return { data: matches.map((r) => ({ ...r })), error: null }
    }

    return api
  }

  return { client: { from }, tables, log }
}
