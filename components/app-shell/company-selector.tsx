'use client'

import { Check, ChevronsUpDown, Building2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CompanySelectorProps {
  company: {
    id: string
    name: string
    logo_url: string | null
  }
}

export function CompanySelector({ company }: CompanySelectorProps) {
  const initial = company.name.charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring transition-colors">
          <Avatar className="h-6 w-6 shrink-0">
            {company.logo_url && (
              <AvatarImage src={company.logo_url} alt={company.name} />
            )}
            <AvatarFallback className="text-xs font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[160px] truncate">{company.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Companies
        </DropdownMenuLabel>

        <DropdownMenuItem className="flex items-center gap-2">
          <Avatar className="h-5 w-5 shrink-0">
            {company.logo_url && (
              <AvatarImage src={company.logo_url} alt={company.name} />
            )}
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">{company.name}</span>
          <Check className="h-4 w-4 text-primary shrink-0" />
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>Add company</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
