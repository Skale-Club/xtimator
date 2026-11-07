'use client'

import { notFound } from 'next/navigation'
import { CheckCircle, Clock, DollarSign, FolderOpen } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { StatCards } from '@/components/dashboard/stat-cards'

/**
 * Dev-only visual check for the dashboard stat cards, so they can be looked at
 * without signing in. The Portuguese row uses the labels the translator returns,
 * the longest ones the cards have to fit. Nothing imports this route.
 */
export default function StatCardsPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  const stats = { totalProjects: 7, pendingEstimates: 22, acceptedEstimates: 0, totalRevenue: 0 }
  return <main className="min-h-dvh space-y-8 bg-background py-8">
    <section className="space-y-3">
      <h2 className="px-6 text-sm font-semibold text-muted-foreground">English</h2>
      <StatCards stats={stats} />
    </section>
    <section className="space-y-3">
      <h2 className="px-6 text-sm font-semibold text-muted-foreground">Português</h2>
      <div className="grid grid-cols-2 gap-3 px-6 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={FolderOpen} label="Total de projetos" value={7} tone="blue" />
        <StatCard icon={Clock} label="Estimativas pendentes" value={22} index={1} tone="amber" />
        <StatCard icon={CheckCircle} label="Aceito" value={0} index={2} tone="emerald" />
        <StatCard icon={DollarSign} label="Receita total" value="$128,450" index={3} tone="violet" />
      </div>
    </section>
  </main>
}
