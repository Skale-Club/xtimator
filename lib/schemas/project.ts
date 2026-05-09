import { z } from 'zod'

export const inputModeEnum = z.enum(['audio', 'text', 'photos', 'mixed'])

export type InputMode = z.infer<typeof inputModeEnum>

export const projectSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string(),
  inputMode: inputModeEnum.optional(),
})

export type ProjectFormValues = z.infer<typeof projectSchema>

// Step 1: clientId (optional) | Step 2: inputMode (required)
export const STEP_FIELDS: Record<number, (keyof ProjectFormValues)[]> = {
  1: [],
  2: ['inputMode'],
}
