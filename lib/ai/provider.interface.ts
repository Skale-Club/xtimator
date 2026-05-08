// lib/ai/provider.interface.ts
import type { EstimateInput, EstimateOutput } from './types'

export interface AIProvider {
  generateEstimate(input: EstimateInput): Promise<EstimateOutput>
}
