import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, FileText, FolderOpen, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getClientById, getClientProjects } from '@/lib/queries/clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ClientDetailActions } from '@/components/clients/client-detail-actions'
import { ClientNewProjectButton } from '@/components/clients/client-new-project-button'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) redirect('/onboarding')

  const client = await getClientById(supabase, id)
  if (!client) notFound()

  const projects = await getClientProjects(supabase, id)

  const addressParts = [client.address, client.city, client.state, client.zip].filter(Boolean)
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Clients
      </Link>

      {/* Client info card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-16 w-16 shrink-0">
              {client.logo_url && (
                <AvatarImage src={client.logo_url} alt={client.name} />
              )}
              <AvatarFallback className="text-xl">
                {client.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">{client.name}</h1>
                  <Badge variant="secondary" className="mt-1">
                    {client.project_count} project{client.project_count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <ClientDetailActions client={client} companyId={company.id} />
                <ClientNewProjectButton clientId={client.id} clientName={client.name} />
              </div>

              <div className="space-y-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {fullAddress && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{fullAddress}</span>
                  </div>
                )}
              </div>

              {client.notes && (
                <div className="pt-2 border-t">
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <p className="text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Associated projects */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Projects</h2>

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="This client has no projects"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {project.project_type || '---'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {project.total != null
                          ? `$${Number(project.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : '---'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(project.created_at).toLocaleDateString('en-US')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {projects.map((project) => (
                <Card key={project.id}>
                  <CardContent className="p-4">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{project.name}</span>
                        <StatusBadge status={project.status} />
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span className="capitalize">{project.project_type || '---'}</span>
                        <span>
                          {project.total != null
                            ? `$${Number(project.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : '---'}
                        </span>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
