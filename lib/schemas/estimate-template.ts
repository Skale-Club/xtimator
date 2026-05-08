import { z } from 'zod'

export const estimateTemplateSchema = z.object({
  greeting:  z.string().optional().or(z.literal('')),
  opener:    z.string().optional().or(z.literal('')),
  closer:    z.string().optional().or(z.literal('')),
  signature: z.string().optional().or(z.literal('')),
})

export type EstimateTemplateFormValues = z.infer<typeof estimateTemplateSchema>
