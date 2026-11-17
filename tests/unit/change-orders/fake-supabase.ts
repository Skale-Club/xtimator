/**
 * Tiny chainable Supabase stand-in for the change-order tests: every query is
 * recorded as a Call and answered by a handler, so a test can assert both what
 * was asked (table, op, payload, filters) and what comes back.
 */
export interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: Array<[string, string, unknown]>
  terminal: 'single' | 'maybeSingle' | 'list'
}

export type Result = { data?: unknown; error?: unknown; count?: number }

export function makeFakeSupabase(
  handler: (call: Call) => Result | undefined,
  rpcHandler: (name: string, args: Record<string, unknown>) => Result = () => ({ data: null, error: null }),
) {
  const calls: Call[] = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  function builder(table: string) {
    let op: Call['op'] | null = null
    let payload: unknown
    const filters: Call['filters'] = []

    const finish = (terminal: Call['terminal']): Promise<Result> => {
      const call: Call = { table, op: op ?? 'select', payload, filters: [...filters], terminal }
      calls.push(call)
      const result = handler(call) ?? { data: null, error: null }
      return Promise.resolve({ error: null, ...result })
    }

    const chain: Record<string, unknown> = {}
    chain.select = () => {
      if (op === null) op = 'select'
      return chain
    }
    chain.insert = (p: unknown) => {
      op = 'insert'
      payload = p
      return chain
    }
    chain.update = (p: unknown) => {
      op = 'update'
      payload = p
      return chain
    }
    chain.delete = () => {
      op = 'delete'
      return chain
    }
    for (const m of ['eq', 'is', 'in', 'neq', 'gte', 'lte']) {
      chain[m] = (col: string, val: unknown) => {
        filters.push([m, col, val])
        return chain
      }
    }
    chain.order = () => chain
    chain.limit = () => chain
    chain.maybeSingle = () => finish('maybeSingle')
    chain.single = () => finish('single')
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      finish('list').then(resolve, reject)
    return chain
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({ error: null, ...rpcHandler(name, args) })
    },
    auth: { getClaims: () => Promise.resolve({ data: { claims: { sub: 'user-1' } } }) },
  }

  return { client, calls, rpcCalls }
}

export const filterOf = (call: Call, col: string): unknown =>
  call.filters.find(([, c]) => c === col)?.[2]
