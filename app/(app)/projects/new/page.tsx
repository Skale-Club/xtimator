import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getClients } from '@/lib/queries/clients'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { NewProjectWizard } from '@/components/projects/new-project-wizard'

export default async function NewProjectPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const clients = await getClients(supabase, company.id)

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          New project
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pick a client (or skip for now) and choose how you want to describe the
          job. You can change everything later from the project workspace.
        </p>
      </div>

      <NewProjectWizard clients={clients} />
    </div>
  )
}
