import { z } from 'zod'

/** Keep the mailbox intact; normalize surrounding whitespace and the domain. */
export function normalizeClientEmail(value: string): string {
  const trimmed = value.trim()
  const separator = trimmed.lastIndexOf('@')
  return separator < 0
    ? trimmed
    : trimmed.slice(0, separator + 1) + trimmed.slice(separator + 1).toLowerCase()
}

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required'),
  email: z.string().transform(normalizeClientEmail)
    .pipe(z.string().email('Invalid email').or(z.literal(''))).optional(),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  preferred_language: z.enum(['en', 'pt', 'es']).optional().or(z.literal('')),
})

export type ClientFormValues = z.infer<typeof clientSchema>
