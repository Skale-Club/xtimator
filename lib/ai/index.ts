// lib/ai/index.ts
import type { AIProvider } from './provider.interface'

export type { EstimateInput, EstimateOutput, LineItemOutput, PriceBookEntry } from './types'

export async function getAIProvider(): Promise<AIProvider> {
  throw new Error('not implemented')
}
