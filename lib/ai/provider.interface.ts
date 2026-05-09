// lib/ai/provider.interface.ts
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from './types'

export interface AIProvider {
  generateEstimate(input: EstimateInput): Promise<EstimateOutput>
  refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput>
}
