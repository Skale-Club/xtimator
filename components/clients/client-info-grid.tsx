'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Phone, MapPin, FileText } from 'lucide-react'
import type { ClientDetail } from '@/lib/queries/clients'

interface ClientInfoGridProps {
  client: ClientDetail
}

export function ClientInfoGrid({ client }: ClientInfoGridProps) {
  const addressParts = [client.address, client.city, client.state, client.zip].filter(Boolean)
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Contact */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {client.email ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <a
                href={`mailto:${client.email}`}
                className="text-sm text-foreground hover:underline truncate"
              >
                {client.email}
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">No email</span>
            </div>
          )}

          {client.phone ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <a
                href={`tel:${client.phone}`}
                className="text-sm text-foreground hover:underline"
              >
                {client.phone}
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">No phone</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address & Notes */}
      <Card variant="glass">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {fullAddress ? (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground">{fullAddress}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">No address</span>
            </div>
          )}

          {client.notes ? (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">No notes</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
