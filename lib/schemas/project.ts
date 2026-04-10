import { z } from 'zod'

export const projectSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  clientName: z.string(),
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name too long'),
  projectType: z.string().min(1, 'Please select a project type'),
  customProjectType: z.string().optional().or(z.literal('')),
  targetBudget: z.string().optional().or(z.literal('')),
})

export type ProjectFormValues = z.infer<typeof projectSchema>

export const STEP_FIELDS: Record<number, (keyof ProjectFormValues)[]> = {
  1: ['clientId'],
  2: ['name', 'projectType', 'customProjectType', 'targetBudget'],
  3: [],
}
