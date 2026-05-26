// tests/unit/mcp-tool-registry.test.ts
// Phase 89: contract tests for the shared MCP tool registry.
//
// `registerAllTools` MUST install exactly one `tools/list` and one `tools/call`
// handler (the MCP SDK silently overwrites duplicates), and `buildAllTools`
// must concatenate the read (4) + write (2) tool entries with unique names and
// the documented annotation tiers.

import { describe, it, expect, vi } from 'vitest'

// Mock supabase service client — registry tests don't exercise Supabase,
// but buildReadTools is closed over auth and may be invoked indirectly.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}))

// Mock the Inngest client at the module level so write.ts can be imported
// without making any network calls. The registry test never actually invokes
// the create_estimate handler, so an empty stub suffices.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['evt_stub'] }) },
}))

import {
  buildAllTools,
  registerAllTools,
} from '@/lib/mcp/tools/registry'
import type { McpAuthContext } from '@/lib/mcp/auth'

const AUTH: McpAuthContext = {
  client_id: 'c',
  user_id: 'u',
  company_id: 'co',
  scope: ['mcp:read', 'mcp:write'],
}

describe('buildAllTools', () => {
  it('returns the 6 MVP tools (4 read + 2 write)', () => {
    const entries = buildAllTools(AUTH)
    expect(entries).toHaveLength(6)
  })

  it('tool names are unique', () => {
    const entries = buildAllTools(AUTH)
    const names = entries.map((e) => e.definition.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('advertises the expected tool names', () => {
    const entries = buildAllTools(AUTH)
    const names = entries.map((e) => e.definition.name).sort()
    expect(names).toEqual([
      'check_job_status',
      'create_estimate',
      'get_estimate',
      'list_clients',
      'list_estimates',
      'list_projects',
    ])
  })

  it('annotation flags match the per-tool contract', () => {
    const entries = buildAllTools(AUTH)
    const by = (n: string) => entries.find((e) => e.definition.name === n)!.definition.annotations

    // The 4 read tools share the same annotation tier.
    for (const n of ['list_estimates', 'get_estimate', 'list_clients', 'list_projects']) {
      const a = by(n)
      expect(a.readOnlyHint).toBe(true)
      expect(a.destructiveHint).toBe(false)
      expect(a.idempotentHint).toBe(true)
    }

    // create_estimate is the only write tool — non-idempotent (each call
    // queues a fresh AI run), non-destructive.
    const ce = by('create_estimate')
    expect(ce.readOnlyHint).toBe(false)
    expect(ce.destructiveHint).toBe(false)
    expect(ce.idempotentHint).toBe(false)
    expect(ce.title).toBe('Create estimate')

    // check_job_status is read-only but logically lives next to the write
    // tool — Claude.ai still groups it under "Read-only tools" because of
    // its readOnlyHint flag.
    const cj = by('check_job_status')
    expect(cj.readOnlyHint).toBe(true)
    expect(cj.destructiveHint).toBe(false)
    expect(cj.idempotentHint).toBe(true)
    expect(cj.title).toBe('Check job status')
  })

  it('every entry exposes a callable handler', () => {
    const entries = buildAllTools(AUTH)
    for (const e of entries) {
      expect(typeof e.handler).toBe('function')
    }
  })
})

describe('registerAllTools', () => {
  it('calls server.setRequestHandler exactly twice (once for tools/list, once for tools/call)', () => {
    const setRequestHandler = vi.fn()
    const fakeServer = { setRequestHandler } as unknown as Parameters<typeof registerAllTools>[0]

    registerAllTools(fakeServer, AUTH)

    expect(setRequestHandler).toHaveBeenCalledTimes(2)

    // Sanity-check the two schemas — one with method=tools/list, one with
    // method=tools/call.
    const calls = setRequestHandler.mock.calls as Array<
      [{ shape?: { method?: { value?: string } } }, unknown]
    >
    const methods = calls.map((c) => c[0]?.shape?.method?.value).sort()
    expect(methods).toEqual(['tools/call', 'tools/list'])
  })

  it('the registered tools/list handler advertises 6 tools', async () => {
    let listHandler: (() => Promise<{ tools: Array<{ name: string }> }>) | null = null
    const fakeServer = {
      setRequestHandler(
        schema: { shape?: { method?: { value?: string } } },
        handler: unknown,
      ) {
        if (schema.shape?.method?.value === 'tools/list') {
          listHandler = handler as typeof listHandler
        }
      },
    } as unknown as Parameters<typeof registerAllTools>[0]

    registerAllTools(fakeServer, AUTH)
    expect(listHandler).not.toBeNull()

    const res = await listHandler!()
    expect(res.tools).toHaveLength(6)
  })

  it('the registered tools/call handler throws invalid_input for unknown tool names', async () => {
    let callHandler:
      | ((req: { params: { name: string; arguments: unknown } }) => Promise<unknown>)
      | null = null
    const fakeServer = {
      setRequestHandler(
        schema: { shape?: { method?: { value?: string } } },
        handler: unknown,
      ) {
        if (schema.shape?.method?.value === 'tools/call') {
          callHandler = handler as typeof callHandler
        }
      },
    } as unknown as Parameters<typeof registerAllTools>[0]

    registerAllTools(fakeServer, AUTH)
    expect(callHandler).not.toBeNull()

    await expect(
      callHandler!({ params: { name: 'no_such_tool', arguments: {} } }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
  })
})
