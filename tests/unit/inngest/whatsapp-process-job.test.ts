import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { whatsAppProcessJob } from '@/lib/inngest/functions/whatsapp-process'

/**
 * INNGEST-07: whatsAppProcessJob.
 *
 * Contract (post quick-260602-mq2 graph refactor):
 *   - createFunction id = 'whatsapp-process'
 *   - idempotency CEL = 'event.data.batchKey' (deduped across debounced batches)
 *   - The heavy work (per-message processing + generate-estimate + vagueness +
 *     confirm) now lives in lib/whatsapp/estimate-graph.ts and is invoked via a
 *     single step.run('orchestrate-estimate'). The job keeps refresh-typing +
 *     orchestrate-estimate steps.
 *
 * whatsapp-inbound-no-reply-recurrence durable fix:
 *   - The job MUST guarantee the owner gets a reply even when the estimate graph
 *     throws. Two layers: (1) estimate-graph generateEstimateNode catches and
 *     routes to sendError; (2) the job has an onFailure that sends a fallback
 *     reply after retries exhaust.
 */

// Phase 94 (D-13 path repoint): the heavy graph work was lifted out of
// lib/whatsapp/estimate-graph.ts (now a thin wiring layer) into the
// channel-neutral core (lib/estimate/graph/*) + the WhatsApp adapter
// (lib/estimate/adapters/whatsapp.ts). The tokens this test guards moved with
// the code, so each readFileSync is repointed to the token's new home. This is a
// PATH/SOURCE-TARGET update only — the assertions' intent is preserved (the one
// documented exception is the ENGINE-04 generationFailed→failure rename below).
const jobSrc = readFileSync(
  resolve(process.cwd(), 'lib/inngest/functions/whatsapp-process.ts'),
  'utf8'
)
// CORE generate node — now holds generateEstimateForProject + the failure-as-state flag.
const generateSrc = readFileSync(
  resolve(process.cwd(), 'lib/estimate/graph/nodes/generate.ts'),
  'utf8'
)
// CORE assess node — now holds the isVagueEstimate vagueness gate call.
const assessSrc = readFileSync(
  resolve(process.cwd(), 'lib/estimate/graph/nodes/assess.ts'),
  'utf8'
)
// CORE conditional-edge functions — now hold checkGeneratedEdge + the failure read.
const decideSrc = readFileSync(
  resolve(process.cwd(), 'lib/estimate/graph/nodes/decide.ts'),
  'utf8'
)
// CORE graph factory — now holds the generate→assess/onError topology wiring.
const indexSrc = readFileSync(
  resolve(process.cwd(), 'lib/estimate/graph/index.ts'),
  'utf8'
)
// WhatsApp adapter — now holds awaiting_details + buildAskDetailsMessage + revertVagueEstimate.
const adapterSrc = readFileSync(
  resolve(process.cwd(), 'lib/estimate/adapters/whatsapp.ts'),
  'utf8'
)

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
    onFailure?: unknown
  }
}

describe('INNGEST-07: whatsAppProcessJob', () => {
  it('is created with id "whatsapp-process" and idempotency: "event.data.batchKey"', () => {
    const fn = whatsAppProcessJob as unknown as FnInternals
    expect(fn.opts.id).toBe('whatsapp-process')
    expect(fn.opts.idempotency).toBe('event.data.batchKey')
  })

  it('invokes the estimate graph via the orchestrate-estimate step', () => {
    expect(jobSrc).toMatch(/step\.run\(['"]orchestrate-estimate['"]/)
    expect(jobSrc).toMatch(/buildEstimateGraph\(/)
  })

  it('graph runs generate-estimate + vagueness branch (moved out of the job)', () => {
    // The heavy work now lives in the shared core + WhatsApp adapter, not the
    // job file. D-13 path repoint: same tokens, read at their new homes.
    expect(generateSrc).toMatch(/generateEstimateForProject\s*\(/) // CORE generate node
    expect(adapterSrc).toMatch(/awaiting_details/) // WhatsApp adapter finalize (askDetails)
    expect(assessSrc).toMatch(/isVagueEstimate\(/) // CORE assess node (vagueness gate)
    expect(adapterSrc).toMatch(/buildAskDetailsMessage\(/) // WhatsApp adapter finalize
    expect(adapterSrc).toMatch(/revertVagueEstimate\(/) // WhatsApp adapter finalize
  })

  // whatsapp-inbound-no-reply-recurrence: guarantee a reply on failure.
  describe('reply-on-failure guarantee (no silent failures)', () => {
    it('registers an onFailure handler that sends a fallback reply', () => {
      const fn = whatsAppProcessJob as unknown as FnInternals
      expect(typeof fn.opts.onFailure).toBe('function')
      expect(jobSrc).toMatch(/onFailure/)
      expect(jobSrc).toMatch(/sendFallbackReply/)
      // The fallback reads ownerPhone from the original (nested) event payload.
      expect(jobSrc).toMatch(/data\?\.event\?\.data/)
    })

    it('graph generateEstimateNode catches failures and routes to sendError', () => {
      // The node must NOT re-throw — it flags failure-as-state instead.
      // ENGINE-04: generationFailed generalized to failure-as-state (intentional
      // contract change, not a behavior change — the never-throw routing is
      // preserved; the QA-01 frozen never-reply-regression test guards the actual
      // behavior). This is the ONE documented assertion change permitted under
      // D-13 (every other change in this file is a readFileSync path repoint).
      expect(generateSrc).toMatch(/failure/) // CORE generate sets { failure: ... } on catch
      expect(decideSrc).toMatch(/checkGeneratedEdge/) // CORE decide edge fn
      // onError is reachable from the generate node's conditional edge. The node
      // name is now 'generate' (was 'generateEstimate'); topology lives in the
      // shared graph factory (index.ts). Same routing semantics, new location.
      expect(indexSrc).toMatch(
        /addConditionalEdges\(['"]generate['"],\s*checkGeneratedEdge/
      )
    })
  })
})
