import { z } from 'zod'

export const priceBookItemSchema = z.object({
  folder_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Item name is required').max(200),
  unit: z.string().optional().or(z.literal('')),
  unit_price: z.coerce.number().min(0, 'Price must be 0 or greater'),
  notes: z.string().optional().or(z.literal('')),
  image_url: z.string().url().optional().or(z.literal('')),
})

export type PriceBookItemFormValues = z.infer<typeof priceBookItemSchema>

export const bulkAdjustSchema = z.object({
  adjustmentPercent: z
    .coerce.number({ message: 'Enter a number' })
    .min(-100, 'Cannot reduce prices by more than 100%')
    .max(500, 'Maximum adjustment is 500%'),
})

export type BulkAdjustFormValues = z.infer<typeof bulkAdjustSchema>
