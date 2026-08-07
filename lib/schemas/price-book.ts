import { z } from 'zod'
import { assetUrlString } from './asset-url'

export const pricingTypeSchema = z.enum(['fixed', 'area_based', 'base_plus_addons'])
export type PricingType = z.infer<typeof pricingTypeSchema>

export const areaSizeSchema = z.object({
  name: z.string().min(1, 'Size name is required'),
  sqft: z.number().nullable(), // null = custom user input allowed
  price: z.number().min(0),
})
export type AreaSize = z.infer<typeof areaSizeSchema>

export const itemOptionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Option name is required'),
  price: z.coerce.number().min(0),
  max_quantity: z.number().int().positive().optional().nullable(),
  sort_order: z.number().int().default(0),
})
export type ItemOption = z.infer<typeof itemOptionSchema>

export const priceBookItemSchema = z.object({
  folder_id:     z.string().uuid().optional().nullable(),
  name:          z.string().min(1, 'Item name is required').max(200),
  unit:          z.string().optional().or(z.literal('')),
  unit_price:    z.coerce.number().min(0, 'Price must be 0 or greater'),
  notes:         z.string().optional().or(z.literal('')),
  image_url:     assetUrlString().optional().or(z.literal('')),
  pricing_type:  pricingTypeSchema.default('fixed'),
  base_price:    z.coerce.number().min(0).optional().nullable(),
  price_per_unit: z.coerce.number().min(0).optional().nullable(),
  minimum_price:  z.coerce.number().min(0).optional().nullable(),
  area_sizes:    z.array(areaSizeSchema).optional().nullable(),
})

export type PriceBookItemFormValues = z.infer<typeof priceBookItemSchema>

export const bulkAdjustSchema = z.object({
  adjustmentPercent: z
    .coerce.number({ message: 'Enter a number' })
    .min(-100, 'Cannot reduce prices by more than 100%')
    .max(500, 'Maximum adjustment is 500%'),
})

export type BulkAdjustFormValues = z.infer<typeof bulkAdjustSchema>
