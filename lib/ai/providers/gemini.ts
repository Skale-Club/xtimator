// lib/ai/providers/gemini.ts
import type { AIProvider } from '../provider.interface'
import type { EstimateInput, EstimateOutput } from '../types'

export class GeminiAdapter implements AIProvider {
  async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
    throw new Error('not implemented')
  }
}
