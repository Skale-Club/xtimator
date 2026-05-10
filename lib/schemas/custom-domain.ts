import { z } from 'zod'

// Accepts: estimates.mycompany.com  OR  mycompany.com
// Rejects: https://estimates.mycompany.com | mycompany.com/path | bare strings without TLD
const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/

export const customDomainSchema = z.object({
  custom_domain: z
    .string()
    .trim()
    .refine(
      (val) => !val || hostnameRegex.test(val),
      { message: 'Enter a valid hostname (e.g. estimates.mycompany.com). No http:// prefix.' }
    ),
})

export type CustomDomainFormValues = z.infer<typeof customDomainSchema>
