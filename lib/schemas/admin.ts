import { z } from 'zod'

/**
 * Shared zod schemas for the Platform Admin Panel (/admin/*).
 *
 * Exported here so Plans 04 (integrations), 05 (branding), and 06 (admins)
 * import the same source-of-truth shape — no schema drift between client
 * forms and server actions.
 */

export const integrationKeySchema = z.object({
  provider: z.enum(['resend', 'anthropic', 'openai']),
  apiKey: z.string().min(1, 'API key is required'),
})

export const brandingSchema = z.object({
  appName: z.string().min(1).max(64),
  primaryColor: z
    .string()
    .regex(
      /^#[0-9a-fA-F]{6}$/,
      'Invalid color code. Please enter a 6-digit hex value like #0D9488'
    )
    .nullable(),
  emailFromName: z.string().max(128).nullable(),
  logoFile: z.instanceof(File).nullable().optional(),
})

export const addAdminSchema = z.object({
  email: z.string().email(),
})

export type IntegrationKeyInput = z.infer<typeof integrationKeySchema>
export type BrandingInput = z.infer<typeof brandingSchema>
export type AddAdminInput = z.infer<typeof addAdminSchema>
