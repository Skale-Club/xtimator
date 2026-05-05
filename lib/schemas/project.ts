import { z } from 'zod'

export const projectSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  clientName: z.string(),
})

export type ProjectFormValues = z.infer<typeof projectSchema>

export const STEP_FIELDS: Record<number, (keyof ProjectFormValues)[]> = {
  1: ['clientId'],
}
