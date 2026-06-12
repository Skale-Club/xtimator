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

const jobSrc = readFileSync(
  resolve(process.cwd(), 'lib/inngest/functions/whatsapp-process.ts'),
  'utf8'
)
const graphSrc = readFileSync(
  resolve(process.cwd(), 'lib/whatsapp/estimate-graph.ts'),
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
    // The heavy work now lives in the graph, not the job file.
    expect(graphSrc).toMatch(/generateEstimateForProject\s*\(/)
    expect(graphSrc).toMatch(/awaiting_details/)
    expect(graphSrc).toMatch(/isVagueEstimate\(/)
    expect(graphSrc).toMatch(/buildAskDetailsMessage\(/)
    expect(graphSrc).toMatch(/revertVagueEstimate\(/)
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
      // The node must NOT re-throw — it flags generationFailed instead.
      expect(graphSrc).toMatch(/generationFailed/)
      expect(graphSrc).toMatch(/checkGeneratedEdge/)
      // sendError is reachable from the generateEstimate conditional edge.
      expect(graphSrc).toMatch(
        /addConditionalEdges\(['"]generateEstimate['"],\s*checkGeneratedEdge/
      )
    })
  })
})
