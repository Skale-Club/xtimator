'use client'

// Stub — full implementation in Task 2.
// Exists so PriceBookList's import resolves; the test mocks this module entirely.
import type { PriceBookItem } from '@/lib/queries/price-book'

interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PriceBookItem | null
  companyId: string
  existingCategories: string[]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PriceBookItemDialog(_props: PriceBookItemDialogProps) {
  return null
}
