'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ProjectStatusTabOption<TValue extends string> {
  value: TValue
  label: ReactNode
}

interface ProjectStatusTabsProps<TValue extends string> {
  value: TValue
  options: readonly ProjectStatusTabOption<TValue>[]
  onValueChange: (value: TValue) => void
}

export function ProjectStatusTabs<TValue extends string>({
  value,
  options,
  onValueChange,
}: ProjectStatusTabsProps<TValue>) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as TValue)}
      className="flex items-stretch"
    >
      <TabsList className="h-full rounded-none border-0 bg-transparent gap-0 px-1">
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            onClick={() => onValueChange(option.value)}
            className="h-7 rounded-sm px-2.5 text-xs data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
