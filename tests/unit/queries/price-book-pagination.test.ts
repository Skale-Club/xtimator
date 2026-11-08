import { describe, expect, it } from 'vitest'
import { getPriceBookItems, PRICE_BOOK_PAGE_SIZE } from '@/lib/queries/price-book'

function mockClient(total: number) {
  const calls: Array<{ from: number; to: number; orders: string[] }> = []
  const all = Array.from({ length: total }, (_, i) => ({
    id: `id-${i}`,
    name: `item ${i}`,
    price_book_folders: i % 2 ? { name: 'F' } : null,
  }))
  const client = {
    from() {
      const orders: string[] = []
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: (col: string) => (orders.push(col), chain),
        range: (from: number, to: number) => {
          calls.push({ from, to, orders: [...orders] })
          return Promise.resolve({ data: all.slice(from, to + 1), error: null })
        },
      }
      return chain
    },
  }
  return { client: client as any, calls }
}

describe('getPriceBookItems pagination', () => {
  it('reads a second page when the first is full and keeps every row', async () => {
    const { client, calls } = mockClient(PRICE_BOOK_PAGE_SIZE + 250)
    const items = await getPriceBookItems(client, 'co')
    expect(items).toHaveLength(PRICE_BOOK_PAGE_SIZE + 250)
    expect(calls.map((c) => [c.from, c.to])).toEqual([
      [0, PRICE_BOOK_PAGE_SIZE - 1],
      [PRICE_BOOK_PAGE_SIZE, PRICE_BOOK_PAGE_SIZE * 2 - 1],
    ])
    expect(calls[0].orders).toEqual(['name', 'id'])
    expect(items[1].folder_name).toBe('F')
    expect(items[0].folder_name).toBeNull()
  })

  it('stops after one page for a small book', async () => {
    const { client, calls } = mockClient(3)
    expect(await getPriceBookItems(client, 'co')).toHaveLength(3)
    expect(calls).toHaveLength(1)
  })

  it('asks for a third (empty) page when the book is an exact multiple of the page size', async () => {
    const { client, calls } = mockClient(PRICE_BOOK_PAGE_SIZE)
    expect(await getPriceBookItems(client, 'co')).toHaveLength(PRICE_BOOK_PAGE_SIZE)
    expect(calls).toHaveLength(2)
  })
})
