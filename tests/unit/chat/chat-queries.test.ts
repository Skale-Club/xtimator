/**
 * Behavior contract for the lib/queries/chat.ts helpers (CHATDB-02).
 *
 * Mirrors the lib/queries/whatsapp-inbox.ts pattern: every helper resolves
 * getActiveCompanyId() internally (no caller-supplied tenant is trusted) and
 * re-scopes every query by company_id (+ user_id for conversations) through the
 * service client. The literal 'company-SECRET' is the cross-tenant tripwire —
 * every tenant query MUST carry it.
 *
 * The chainable mock records every .eq(col, val) call and the .from(table) name
 * so the assertions can prove the scoping shape without a real database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'
import {
  listConversations,
  getConversationWithMessages,
  createConversation,
  appendMessage,
} from '@/lib/queries/chat'

const getActiveCompanyIdMock = vi.mocked(getActiveCompanyId)
const createServiceClientMock = vi.mocked(createServiceClient)

/** A recorded query against a single table. */
interface RecordedQuery {
  table: string
  eqs: Array<[string, unknown]>
  orders: Array<[string, { ascending?: boolean }]>
  inserted?: unknown
  updated?: unknown
  terminal?: 'maybeSingle' | 'single' | 'list'
}

/**
 * Build a chainable supabase-client mock. `tableResults` maps a table name to the
 * `{ data }` its terminal resolves. Every chained call returns the same builder
 * (so .from/.select/.eq/.order/.limit/.insert/.update compose), and the terminal
 * resolvers (.maybeSingle/.single) resolve the configured row; a non-terminal
 * chain is itself awaitable (resolves the list form).
 */
function makeServiceClientMock(
  tableResults: Record<string, { data: unknown }>,
) {
  const queries: RecordedQuery[] = []

  function builderFor(table: string) {
    const q: RecordedQuery = { table, eqs: [], orders: [] }
    queries.push(q)

    const result = tableResults[table] ?? { data: null }

    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      eq(col: string, val: unknown) {
        q.eqs.push([col, val])
        return builder
      },
      order(col: string, opts: { ascending?: boolean } = {}) {
        q.orders.push([col, opts])
        return builder
      },
      limit() {
        return builder
      },
      insert(payload: unknown) {
        q.inserted = payload
        return builder
      },
      update(payload: unknown) {
        q.updated = payload
        return builder
      },
      maybeSingle() {
        q.terminal = 'maybeSingle'
        return Promise.resolve(result)
      },
      single() {
        q.terminal = 'single'
        return Promise.resolve(result)
      },
      // A non-terminal chain (e.g. listConversations / the bump update) is awaited
      // directly — make the builder thenable so `await svc.from(...)...` resolves.
      then(onFulfilled: (value: { data: unknown }) => unknown) {
        q.terminal = q.terminal ?? 'list'
        return Promise.resolve(result).then(onFulfilled)
      },
    }
    return builder
  }

  const client = {
    from(table: string) {
      return builderFor(table)
    },
  }

  return { client, queries }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listConversations', () => {
  it('scopes by company_id + user_id and orders by updated_at descending', async () => {
    getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
    const rows = [{ id: 'c1' }, { id: 'c2' }]
    const { client, queries } = makeServiceClientMock({
      chat_conversations: { data: rows },
    })
    createServiceClientMock.mockReturnValue(client as never)

    const result = await listConversations('user-1')

    const q = queries.find((x) => x.table === 'chat_conversations')!
    expect(q).toBeDefined()
    expect(q.eqs).toContainEqual(['company_id', 'company-SECRET'])
    expect(q.eqs).toContainEqual(['user_id', 'user-1'])
    const updatedAtOrder = q.orders.find(([col]) => col === 'updated_at')
    expect(updatedAtOrder).toBeDefined()
    expect(updatedAtOrder![1].ascending).toBe(false)
    expect(result).toEqual(rows)
  })

  it('returns [] without touching the service client when there is no active company', async () => {
    getActiveCompanyIdMock.mockResolvedValue(null)

    const result = await listConversations('user-1')

    expect(result).toEqual([])
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})

describe('getConversationWithMessages', () => {
  it('scopes the conversation by id+company+user and fetches its messages oldest-first', async () => {
    getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
    const conversation = { id: 'conv-1', company_id: 'company-SECRET' }
    const messages = [{ id: 'm1' }, { id: 'm2' }]
    const { client, queries } = makeServiceClientMock({
      chat_conversations: { data: conversation },
      chat_messages: { data: messages },
    })
    createServiceClientMock.mockReturnValue(client as never)

    const result = await getConversationWithMessages('conv-1', 'user-1')

    const convQ = queries.find((x) => x.table === 'chat_conversations')!
    expect(convQ.eqs).toContainEqual(['id', 'conv-1'])
    expect(convQ.eqs).toContainEqual(['company_id', 'company-SECRET'])
    expect(convQ.eqs).toContainEqual(['user_id', 'user-1'])

    const msgQ = queries.find((x) => x.table === 'chat_messages')!
    expect(msgQ).toBeDefined()
    expect(msgQ.eqs).toContainEqual(['conversation_id', 'conv-1'])
    const createdOrder = msgQ.orders.find(([col]) => col === 'created_at')
    expect(createdOrder).toBeDefined()
    expect(createdOrder![1].ascending).toBe(true)

    expect(result).toEqual({ conversation, messages })
  })

  it('returns null and does NOT query chat_messages when the conversation is not found/owned', async () => {
    getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
    const { client, queries } = makeServiceClientMock({
      chat_conversations: { data: null },
    })
    createServiceClientMock.mockReturnValue(client as never)

    const result = await getConversationWithMessages('conv-x', 'user-1')

    expect(result).toBeNull()
    expect(queries.find((x) => x.table === 'chat_messages')).toBeUndefined()
  })
})

describe('createConversation', () => {
  it('inserts a thread scoped to the active company + owner and returns the row', async () => {
    getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
    const inserted = { id: 'new-conv', company_id: 'company-SECRET', user_id: 'user-1' }
    const { client, queries } = makeServiceClientMock({
      chat_conversations: { data: inserted },
    })
    createServiceClientMock.mockReturnValue(client as never)

    const result = await createConversation('user-1', 'My thread')

    const q = queries.find((x) => x.table === 'chat_conversations')!
    expect(q.inserted).toMatchObject({
      company_id: 'company-SECRET',
      user_id: 'user-1',
      title: 'My thread',
    })
    expect(result).toEqual(inserted)
  })
})

describe('appendMessage', () => {
  it('inserts the message with the denormalized company_id AND bumps the parent updated_at', async () => {
    getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
    const inserted = { id: 'msg-1', conversation_id: 'conv-1', company_id: 'company-SECRET' }
    const { client, queries } = makeServiceClientMock({
      chat_messages: { data: inserted },
      chat_conversations: { data: null },
    })
    createServiceClientMock.mockReturnValue(client as never)

    const result = await appendMessage({
      conversationId: 'conv-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    })

    // The insert into chat_messages carries the denormalized company_id.
    const insertQ = queries.find((x) => x.table === 'chat_messages' && x.inserted)!
    expect(insertQ).toBeDefined()
    expect(insertQ.inserted).toMatchObject({
      conversation_id: 'conv-1',
      company_id: 'company-SECRET',
      role: 'user',
    })

    // The bump: an update to chat_conversations setting updated_at, scoped by id.
    const bumpQ = queries.find((x) => x.table === 'chat_conversations' && x.updated)!
    expect(bumpQ).toBeDefined()
    expect(bumpQ.updated).toHaveProperty('updated_at')
    expect(bumpQ.eqs).toContainEqual(['id', 'conv-1'])

    expect(result).toEqual(inserted)
  })

  it('no-ops (returns null, no insert) when there is no active company', async () => {
    getActiveCompanyIdMock.mockResolvedValue(null)

    const result = await appendMessage({
      conversationId: 'conv-1',
      role: 'user',
      parts: [],
    })

    expect(result).toBeNull()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})
