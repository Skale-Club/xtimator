import { z } from 'zod'

export const projectSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string(),
})

export type ProjectFormValues = z.infer<typeof projectSchema>

export const STEP_FIELDS: Record<number, (keyof ProjectFormValues)[]> = {
  1: [],
}
