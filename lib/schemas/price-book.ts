import { z } from 'zod'

export const priceBookItemSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Item name is required').max(200),
  unit: z.string().optional().or(z.literal('')),
  unit_price: z.coerce.number().min(0, 'Price must be 0 or greater'),
  notes: z.string().optional().or(z.literal('')),
})

export type PriceBookItemFormValues = z.infer<typeof priceBookItemSchema>
