import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as functionsModule from '@/lib/inngest/functions'

/**
 * Deploy-sync guard: every Inngest function exported from
 * lib/inngest/functions/index.ts MUST be registered in the serve() functions
 * array in app/api/inngest/route.ts.
 *
 * Why this test exists: on 2026-06-03 a deploy added `whatsAppIntentRouterJob`
 * to the barrel + client, but the serve endpoint's function set / Inngest Cloud
 * sync lagged — Cloud accepted events yet never invoked ANY function, silently
 * stopping every event-triggered job in production for days. The more general
 * mistake this catches: exporting a new function from the barrel (so it looks
 * "wired up") while forgetting to add it to route.ts's `functions: [...]` array,
 * which means Inngest never serves it and it never runs.
 * See .planning/debug/whatsapp-inbound-no-reply-recurrence.md.
 *
 * route.ts imports its identifiers straight from the '@/lib/inngest/functions'
 * barrel, so the identifier used in the serve array is the SAME name the barrel
 * exports — comparing name sets is exact and meaningful. The exported set is
 * read at runtime (source of truth); the served set is parsed from route.ts's
 * functions array.
 */

type InngestFunctionLike = { opts?: { id?: unknown } }

function isInngestFunction(value: unknown): value is InngestFunctionLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'opts' in value &&
    typeof (value as InngestFunctionLike).opts?.id === 'string'
  )
}

/** Identifier names listed inside route.ts's `functions: [ ... ]` array. */
function extractServedIdentifiers(source: string): string[] {
  const match = source.match(/functions:\s*\[([\s\S]*?)\]/)
  if (!match) {
    throw new Error(
      'Could not locate the `functions: [ ... ]` array in app/api/inngest/route.ts — ' +
        'has the serve() call been restructured?',
    )
  }
  return match[1]
    .replace(/\/\/[^\n]*/g, '') // drop any line comments inside the array
    .split(',')
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token))
}

describe('Inngest serve registration: every exported function is served', () => {
  // Runtime source of truth: all Inngest functions the barrel exports.
  const exportedNames = Object.keys(functionsModule).filter((name) =>
    isInngestFunction((functionsModule as Record<string, unknown>)[name]),
  )

  const routeSource = readFileSync(
    resolve(process.cwd(), 'app/api/inngest/route.ts'),
    'utf8',
  )
  const servedNames = extractServedIdentifiers(routeSource)

  it('sanity: both sets are non-empty (guards against a vacuous pass or a broken parse)', () => {
    // Inventory-agnostic on purpose: the guard must keep passing as functions are
    // legitimately added/removed, and fail ONLY when the two sets diverge. So we
    // assert the barrel actually loaded functions and the route parse found the
    // array — never a hardcoded count or a specific function name.
    expect(exportedNames.length).toBeGreaterThan(0)
    expect(servedNames.length).toBeGreaterThan(0)
  })

  it('every function exported from lib/inngest/functions is present in route.ts serve() functions array', () => {
    const missing = exportedNames.filter((name) => !servedNames.includes(name))
    expect(
      missing,
      'These Inngest functions are exported from lib/inngest/functions/index.ts but are ' +
        'NOT registered in app/api/inngest/route.ts serve() — Inngest will never invoke ' +
        'them, so they will silently never run in production. Add them to the functions ' +
        `array: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every identifier in route.ts serve() array is a real exported Inngest function (no stale/typo entries)', () => {
    const unknownServed = servedNames.filter(
      (name) => !exportedNames.includes(name),
    )
    expect(
      unknownServed,
      'These identifiers appear in the route.ts serve() functions array but are not ' +
        `exported Inngest functions from lib/inngest/functions: ${unknownServed.join(', ')}`,
    ).toEqual([])
  })
})
