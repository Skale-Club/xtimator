/**
 * LangGraph tool definitions for the WhatsApp confirmation agent.
 *
 * Each tool wraps an action from confirm-actions.ts and returns a human-readable
 * string. The agent uses these strings to compose a single WhatsApp reply to the owner.
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadCurrentSession, sameSession, SessionCommandError,
  SESSION_COMMAND_ERROR_MESSAGES, type CommandScope,
} from '@/lib/whatsapp/session-commands'
import {
  actionSend,
  actionCancel,
  actionUpdateField,
  actionSetClient,
  actionRegenerate,
  actionGetEstimateContext,
  actionUpdateItem,
  actionAddItem,
  actionRemoveItem,
  formatEstimateContext,
  CHANGE_ESTIMATE_TOTAL_MESSAGE,
  type EditableFields,
  type ItemMutationResult,
} from '@/lib/whatsapp/confirm-actions'
import { describeSendResult } from '@/lib/whatsapp/send-result-message'
import {
  getNumberedEstimate,
  buildNumberedBreakdownLines,
} from '@/lib/whatsapp/estimate-numbering'
import { formatMoney } from '@/lib/money/currency'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

async function reportCommand(action: () => Promise<string>): Promise<string> {
  try {
    return await action()
  } catch (err) {
    if (err instanceof SessionCommandError) return SESSION_COMMAND_ERROR_MESSAGES[err.reason]
    console.error('[WhatsApp] estimate command failed', err)
    return 'I could not verify that action. Check the estimate in the app before trying again.'
  }
}

export async function runStandaloneConfirmation(
  scope: CommandScope,
  supabase: SupabaseClient,
  confirmation: 'send' | 'cancel',
  language: EstimateLanguage,
): Promise<string> {
  return reportCommand(async () => {
    if (confirmation === 'send') {
      return describeSendResult(await actionSend(scope, supabase, language), language)
    }
    await actionCancel(scope, supabase)
    return {
      en: 'WhatsApp confirmation closed. You can still find the estimate in the app.',
      pt: 'Confirmação encerrada no WhatsApp. Seu orçamento continua disponível no app.',
      es: 'Confirmación cerrada en WhatsApp. El presupuesto sigue disponible en la app.',
    }[language]
  })
}

export function makeConfirmationTools(
  scope: CommandScope,
  supabase: SupabaseClient,
) {
  const { session, companyId, ownerPhone } = scope
  let queued: Promise<unknown> = Promise.resolve()

  // LangGraph can issue multiple tool calls together. Order this agent's edits
  // locally, with durable database claims handling other workers and retries.
  function run(action: () => Promise<string>): Promise<string> {
    const result = queued.then(() => reportCommand(action))
    queued = result
    return result
  }

  async function updateField(patch: EditableFields, done: string): Promise<string> {
    return run(async () => {
      const updated = await actionUpdateField(scope, supabase, patch)
      return `${done}\n\n${formatEstimateContext(updated)}`
    })
  }

  const sendEstimate = tool(
    async () => 'Review the current estimate after any requested changes, then reply SEND in a separate message to deliver it.',
    {
      name: 'send_estimate',
      description: 'Explain how the owner can deliver the estimate with a standalone SEND reply.',
      schema: z.object({}),
    }
  )

  const cancelEstimate = tool(
    async () => 'Reply CANCEL by itself to close this WhatsApp confirmation. The estimate stays in the app.',
    {
      name: 'cancel_estimate',
      description: 'Explain how to close the WhatsApp confirmation and keep the estimate in the app.',
      schema: z.object({}),
    }
  )

  const updateTotal = tool(
    async () => CHANGE_ESTIMATE_TOTAL_MESSAGE,
    {
      name: 'update_total',
      description: 'Explain how to change a requested overall total by editing line items. Does not change prices.',
      schema: z.object({ value: z.number().positive().describe('Requested total amount') }),
    }
  )

  const updateTimeline = tool(
    async ({ value }: { value: string }) => {
      return updateField({ timeline: value }, 'Timeline updated.')
    },
    {
      name: 'update_timeline',
      description: 'Update the project timeline or completion timeframe.',
      schema: z.object({
        value: z.string().describe('New timeline description'),
      }),
    }
  )

  const updatePaymentTerms = tool(
    async ({ value }: { value: string }) => {
      return updateField({ payment_terms: value }, 'Payment terms updated.')
    },
    {
      name: 'update_payment_terms',
      description: 'Update the payment terms or schedule.',
      schema: z.object({
        value: z.string().describe('New payment terms'),
      }),
    }
  )

  const updateSummary = tool(
    async ({ value }: { value: string }) => {
      return updateField({ summary: value }, 'Summary updated.')
    },
    {
      name: 'update_summary',
      description: 'Update the estimate summary or description.',
      schema: z.object({
        value: z.string().describe('New summary text'),
      }),
    }
  )

  const setClient = tool(
    async ({ name, phone }: { name: string; phone: string }) => run(async () => {
      const result = await actionSetClient(scope, supabase, name, phone)
      const verb = result.isNew ? 'created' : 'updated'
      return `Client ${verb}: ${result.name} (${result.phone})`
    }),
    {
      name: 'set_client',
      description:
        "Set or update the client name and phone for this estimate. Use when the owner provides a client's name and phone number.",
      schema: z.object({
        name: z.string().describe("Client's full name"),
        phone: z
          .string()
          .describe("Client's phone number in E.164 format (e.g. +15552223333)"),
      }),
    }
  )

  const regenerateEstimate = tool(
    async () => run(async () => {
      const result = await actionRegenerate(scope, supabase)
      return `Estimate regenerated. The previous version remains in the app.\n\n${formatEstimateContext(result.context)}`
    }),
    {
      name: 'regenerate_estimate',
      description:
        'Rebuild the estimate from the original job site recording. Use when the owner wants a fresh or redone estimate.',
      schema: z.object({}),
    }
  )

  // Compose a tool reply from an item-mutation result: the human summary plus
  // the REFRESHED numbered breakdown so the agent (and its next reference) stay
  // grounded on the new numbering after the edit.
  const formatMutation = (result: ItemMutationResult): string => {
    if (!result.ok) return result.message
    const breakdown = result.breakdown
    if (!breakdown) return result.message
    const lines = buildNumberedBreakdownLines(breakdown.sections, breakdown.currencyCode)
    const total = formatMoney(breakdown.total, breakdown.currencyCode)
    return `${result.message}\n\nUpdated estimate — ${total}\n${lines}`
  }

  const updateItem = tool(
    async ({
      sectionNumber,
      itemNumber,
      price,
      quantity,
      name,
    }: {
      sectionNumber: number
      itemNumber: number
      price?: number
      quantity?: number
      name?: string
    }) => run(async () => {
      const result = await actionUpdateItem(
        scope,
        supabase,
        sectionNumber,
        itemNumber,
        { price, quantity, name }
      )
      return formatMutation(result)
    }),
    {
      name: 'update_item',
      description:
        'Change a single line item referenced by its number "section.item" (e.g. 2.3 = the 3rd item of the 2nd section). Set any of price, quantity, or name. Section/item totals and the estimate total are recomputed automatically. Only call with numbers that exist in the current numbered estimate — if the owner\'s reference is unclear, call get_estimate_details and/or ask which item they mean.',
      schema: z.object({
        sectionNumber: z.number().int().positive().describe('1-based section number (the N in N.M)'),
        itemNumber: z.number().int().positive().describe('1-based item number within the section (the M in N.M)'),
        price: z.number().nonnegative().optional().describe('New unit price in dollars'),
        quantity: z.number().positive().optional().describe('New quantity'),
        name: z.string().optional().describe('New item description'),
      }),
    }
  )

  const addItem = tool(
    async ({
      sectionNumber,
      name,
      price,
      quantity,
    }: {
      sectionNumber: number
      name: string
      price: number
      quantity?: number
    }) => run(async () => {
      const result = await actionAddItem(
        scope,
        supabase,
        sectionNumber,
        name,
        price,
        quantity ?? 1
      )
      return formatMutation(result)
    }),
    {
      name: 'add_item',
      description:
        'Add a new line item to an existing section (referenced by its 1-based number). Totals are recomputed automatically. If it is unclear which section the owner means, call get_estimate_details and/or ask first.',
      schema: z.object({
        sectionNumber: z.number().int().positive().describe('1-based section number to add the item to'),
        name: z.string().describe('Item description, e.g. "haul away debris"'),
        price: z.number().nonnegative().describe('Unit price in dollars'),
        quantity: z.number().positive().optional().describe('Quantity (defaults to 1)'),
      }),
    }
  )

  const removeItem = tool(
    async ({ sectionNumber, itemNumber }: { sectionNumber: number; itemNumber: number }) => run(async () => {
      const result = await actionRemoveItem(scope, supabase, sectionNumber, itemNumber)
      return formatMutation(result)
    }),
    {
      name: 'remove_item',
      description:
        'Remove a line item referenced by its number "section.item" (e.g. 1.2). Totals are recomputed automatically. Only call with numbers that exist in the current numbered estimate.',
      schema: z.object({
        sectionNumber: z.number().int().positive().describe('1-based section number (the N in N.M)'),
        itemNumber: z.number().int().positive().describe('1-based item number within the section (the M in N.M)'),
      }),
    }
  )

  const getEstimateDetails = tool(
    async () => run(async () => {
      const current = await loadCurrentSession(supabase, companyId, ownerPhone)
      if (!sameSession(current, session)) throw new SessionCommandError('stale')
      if (!session.draft_estimate_id) return 'No estimate loaded.'
      const [ctx, numbered] = await Promise.all([
        actionGetEstimateContext(supabase, session.draft_estimate_id, companyId),
        getNumberedEstimate(supabase, session.draft_estimate_id),
      ])
      const base = formatEstimateContext(ctx)
      if (!numbered || numbered.sections.length === 0) return base
      const lines = buildNumberedBreakdownLines(numbered.sections, numbered.currencyCode)
      // The numbered breakdown grounds section/item references (N.M) for the
      // edit tools; keep it alongside the human-readable context.
      return `${base}\n\nNumbered breakdown (use these numbers for edits):\n${lines}`
    }),
    {
      name: 'get_estimate_details',
      description:
        'Get the current estimate details: total, sections, timeline, payment terms, summary, AND a numbered breakdown (sections 1..N, items N.M) to reference when editing line items. Use to answer questions or to ground an item reference before an edit.',
      schema: z.object({}),
    }
  )

  return [
    sendEstimate,
    cancelEstimate,
    updateTotal,
    updateTimeline,
    updatePaymentTerms,
    updateSummary,
    setClient,
    regenerateEstimate,
    updateItem,
    addItem,
    removeItem,
    getEstimateDetails,
  ]
}
