import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'

describe('UI overlays — Phase 9 redesign', () => {
  it('DialogContent uses --radius-lg + glass-strong surface (Phase 71)', () => {
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent data-testid="dialog-content">
          <DialogTitle>Overlay test</DialogTitle>
          <DialogDescription>Verifies the dialog surface tokens.</DialogDescription>
          body
        </DialogContent>
      </Dialog>
    )
    const content = screen.getByTestId('dialog-content')
    expect(content.className).toContain('rounded-[var(--radius-lg)]')
    // Phase 71: shadow-lg → shadow-glass, border-border → border-[var(--glass-border)]
    expect(content.className).toContain('shadow-glass')
    expect(content.className).toContain('border-[var(--glass-border)]')
    expect(content.className).toContain('bg-[var(--glass-bg-strong)]')
  })

  it('DropdownMenuContent uses --radius-md + --shadow-md and items use --radius-sm', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>trigger</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="dd-content">
          <DropdownMenuItem data-testid="dd-item">hi</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const content = screen.getByTestId('dd-content')
    expect(content.className).toContain('rounded-[var(--radius-md)]')
    expect(content.className).toContain('shadow-md')
    const item = screen.getByTestId('dd-item')
    expect(item.className).toContain('rounded-[var(--radius-sm)]')
  })

  it('TableRow has hover:bg-muted and border-b', () => {
    render(
      <Table>
        <TableBody>
          <TableRow data-testid="row">
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const row = screen.getByTestId('row')
    expect(row.className).toContain('hover:bg-muted')
    expect(row.className).toContain('border-b')
  })
})
