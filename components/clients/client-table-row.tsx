import Link from 'next/link'
import type { ClientWithCount } from '@/lib/queries/clients'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientTableRowProps {
  client: ClientWithCount
}

export function ClientTableRow({ client }: ClientTableRowProps) {
  const { t } = useTranslation()

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/clients/${client.id}`}
          className="flex items-center gap-3 hover:underline"
        >
          <Avatar className="h-8 w-8">
            {client.logo_url && (
              <AvatarImage src={client.logo_url} alt={client.name} />
            )}
            <AvatarFallback className="text-xs">
              {client.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{client.name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {client.email || '---'}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {client.phone
          ? <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>
          : '---'}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{client.project_count}</Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}`}>{t('View')}</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}