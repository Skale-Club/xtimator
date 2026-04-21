'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { removePlatformAdmin } from './actions'

export type AdminRow = {
  user_id: string
  email: string
  created_at: string
}

type Props = {
  admins: AdminRow[]
  currentUserId: string
}

/**
 * Renders the table of platform admins (UI-SPEC §AdminList).
 *
 * Per copywriting contract:
 *  - "Admin since {date}" column
 *  - "Remove" button per row, destructive variant
 *  - When the row is the current user AND admins.length === 1, the button is
 *    disabled and the tooltip reads "You are the only admin. Add another admin
 *    before removing yourself."
 *  - Confirmation flow: AlertDialog → server action → toast
 */
export function AdminList({ admins, currentUserId }: Props) {
  const [pendingRow, setPendingRow] = useState<AdminRow | null>(null)
  const [isPending, startTransition] = useTransition()

  const onlyAdmin = admins.length === 1

  const confirmRemove = (row: AdminRow) => {
    startTransition(async () => {
      const result = await removePlatformAdmin({ userId: row.user_id })
      setPendingRow(null)
      if (result.ok) {
        toast.success(`${row.email} removed as platform admin.`)
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((row) => {
              const isSelf = row.user_id === currentUserId
              const disabled = isSelf && onlyAdmin
              const initials = row.email.slice(0, 2).toUpperCase()
              return (
                <TableRow key={row.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.email}</span>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      Admin since {format(new Date(row.created_at), 'MMM d, yyyy')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {disabled ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {/* span wrapper so the disabled button still triggers the tooltip */}
                          <span tabIndex={0}>
                            <Button variant="destructive" size="sm" disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          You are the only admin. Add another admin before removing
                          yourself.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setPendingRow(row)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={pendingRow !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRow(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove platform admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRow?.email} will lose access to the admin panel. Their user
              account is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault()
                if (pendingRow) confirmRemove(pendingRow)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? 'Removing…' : 'Remove admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
