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
  type ItemMutationResult,
  type Session,
} from '@/lib/whatsapp/confirm-actions'
import {
  getNumberedEstimate,
  buildNumberedBreakdownLines,
} from '@/lib/whatsapp/estimate-numbering'
import { formatMoney } from '@/lib/money/currency'

export function makeConfirmationTools(
  session: Session,
  companyId: string,
  supabase: SupabaseClient
) {
  const sendEstimate = tool(
    async () => {
      const result = await actionSend(session, companyId, supabase)
      if (result.deliveredToClient) {
        const who = result.clientName ?? result.clientPhone
        return `Estimate sent to ${who} via WhatsApp. Share link: ${result.shareUrl}`
      }
      return `Estimate ready. Share link: ${result.shareUrl}\n(No client phone on file — share manually)`
    },
    {
      name: 'send_estimate',
      description:
        'Deliver the estimate to the client and mark it as sent. Use when the owner wants to send, deliver, submit, or go ahead with the estimate.',
      schema: z.object({}),
    }
  )

  const cancelEstimate = tool(
    async () => {
      await actionCancel(session, supabase)
      return 'Estimate discarded and draft deleted.'
    },
    {
      name: 'cancel_estimate',
      description:
        'Discard the current estimate draft. Use when the owner wants to cancel, scrap, or start over.',
      schema: z.object({}),
    }
  )

  const updateTotal = tool(
    async ({ value }: { value: number }) => {
      const updated = await actionUpdateField(session, supabase, { total: value })
      return `Total updated.\n\n${formatEstimateContext(updated)}`
    },
    {
      name: 'update_total',
      description:
        'Update the estimate total amount. Use when the owner gives a new price, total, or amount.',
      schema: z.object({
        value: z.number().positive().describe('New total amount in dollars'),
      }),
    }
  )

  const updateTimeline = tool(
    async ({ value }: { value: string }) => {
      const updated = await actionUpdateField(session, supabase, { timeline: value })
      return `Timeline updated.\n\n${formatEstimateContext(updated)}`
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
      const updated = await actionUpdateField(session, supabase, { payment_terms: value })
      return `Payment terms updated.\n\n${formatEstimateContext(updated)}`
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
      const updated = await actionUpdateField(session, supabase, { summary: value })
      return `Summary updated.\n\n${formatEstimateContext(updated)}`
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
    async ({ name, phone }: { name: string; phone: string }) => {
      const result = await actionSetClient(session, companyId, supabase, name, phone)
      const verb = result.isNew ? 'created' : 'updated'
      return `Client ${verb}: ${result.name} (${result.phone})`
    },
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
    async () => {
      const result = await actionRegenerate(session, companyId, supabase)
      return `Estimate regenerated.\n\n${formatEstimateContext(result.context)}`
    },
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
    }) => {
      const result = await actionUpdateItem(
        session,
        companyId,
        supabase,
        sectionNumber,
        itemNumber,
        { price, quantity, name }
      )
      return formatMutation(result)
    },
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
    }) => {
      const result = await actionAddItem(
        session,
        companyId,
        supabase,
        sectionNumber,
        name,
        price,
        quantity ?? 1
      )
      return formatMutation(result)
    },
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
    async ({ sectionNumber, itemNumber }: { sectionNumber: number; itemNumber: number }) => {
      const result = await actionRemoveItem(session, companyId, supabase, sectionNumber, itemNumber)
      return formatMutation(result)
    },
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
    async () => {
      if (!session.draft_estimate_id) return 'No estimate loaded.'
      const [ctx, numbered] = await Promise.all([
        actionGetEstimateContext(supabase, session.draft_estimate_id),
        getNumberedEstimate(supabase, session.draft_estimate_id),
      ])
      const base = formatEstimateContext(ctx)
      if (!numbered || numbered.sections.length === 0) return base
      const lines = buildNumberedBreakdownLines(numbered.sections, numbered.currencyCode)
      // The numbered breakdown grounds section/item references (N.M) for the
      // edit tools; keep it alongside the human-readable context.
      return `${base}\n\nNumbered breakdown (use these numbers for edits):\n${lines}`
    },
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
