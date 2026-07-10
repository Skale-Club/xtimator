/**
 * CHATUI-02 — pure history seed mapper.
 *
 * toUIMessages maps the Phase-123 persisted ChatMessageRow[] (oldest-first) into
 * the v6 UIMessage[] that seeds useChat({ messages }). Contract:
 *   - order preserved
 *   - only role 'user' | 'assistant' rows survive (tool/system rows dropped —
 *     Open Q2: tool calls live as PARTS on the assistant message, not as
 *     standalone rows)
 *   - parts pass through verbatim (incl. tool-<name> parts)
 *   - non-array / null parts → [] (defensive)
 *   - empty input → []
 *
 * Pure function — no DB, no mocks.
 */
import { describe, it, expect } from 'vitest'
import { toUIMessages } from '@/lib/chat/history-mapper'
import type { ChatMessageRow } from '@/lib/queries/chat'

function row(partial: Partial<ChatMessageRow>): ChatMessageRow {
  return {
    id: 'id',
    conversation_id: 'conv',
    company_id: 'co',
    role: 'user',
    parts: [],
    attachments: null,
    client_id: null,
    created_at: '2026-06-25T00:00:00Z',
    ...partial,
  }
}

describe('toUIMessages (CHATUI-02 history seed)', () => {
  it('returns [] for empty input', () => {
    expect(toUIMessages([])).toEqual([])
  })

  it('prefers the persisted client_id as the UIMessage id (uuid fallback when null)', () => {
    const out = toUIMessages([
      row({ id: 'db-uuid-1', client_id: 'ui-msg-1', role: 'user', parts: [] }),
      row({ id: 'db-uuid-2', client_id: null, role: 'assistant', parts: [] }),
    ])
    // Live-session ids survive the reload → votes/edit/regenerate stay keyed.
    expect(out.map((m) => m.id)).toEqual(['ui-msg-1', 'db-uuid-2'])
  })

  it('preserves order of user/assistant rows', () => {
    const out = toUIMessages([
      row({ id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] }),
      row({ id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] }),
      row({ id: 'c', role: 'user', parts: [{ type: 'text', text: 'bye' }] }),
    ])
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('drops standalone tool and system rows', () => {
    const out = toUIMessages([
      row({ id: 'u', role: 'user', parts: [{ type: 'text', text: 'q' }] }),
      row({ id: 't', role: 'tool', parts: [{ type: 'tool-createEstimate' }] }),
      row({ id: 's', role: 'system', parts: [{ type: 'text', text: 'sys' }] }),
      row({ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'r' }] }),
    ])
    expect(out.map((m) => m.id)).toEqual(['u', 'a'])
  })

  it('passes a tool part on an assistant row through verbatim', () => {
    const toolPart = {
      type: 'tool-createEstimate',
      state: 'output-available',
      toolCallId: 'call-1',
      input: { projectId: 'p1' },
      output: { jobId: 'job-1', status: 'queued' },
    }
    const out = toUIMessages([
      row({ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'on it' }, toolPart] }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].parts).toHaveLength(2)
    expect(out[0].parts[1]).toEqual(toolPart)
  })

  it('coerces non-array parts to [] (defensive)', () => {
    const out = toUIMessages([
      row({ id: 'a', role: 'user', parts: null }),
      row({ id: 'b', role: 'assistant', parts: 'not-an-array' as unknown }),
      row({ id: 'c', role: 'user', parts: undefined as unknown }),
    ])
    expect(out.map((m) => m.parts)).toEqual([[], [], []])
  })
})
