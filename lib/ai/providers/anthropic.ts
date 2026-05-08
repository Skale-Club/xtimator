// lib/ai/providers/anthropic.ts
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput } from '../types'

export class AnthropicAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    throw new Error('not implemented')
  }
}
