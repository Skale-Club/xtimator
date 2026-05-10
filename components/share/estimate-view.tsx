'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { respondToEstimate } from '@/app/estimate/[token]/actions'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { formatCurrency } from '@/lib/utils/format'
import type { ShareEstimateData } from '@/lib/queries/share'

interface EstimateViewProps {
  estimate: ShareEstimateData['estimate']
  client: ShareEstimateData['client']
  token: string
  alreadyResponded: boolean
  appName: string
  whiteLabelMode?: boolean
}

export function EstimateView({
  estimate,
  client,
  token,
  alreadyResponded,
  appName,
  whiteLabelMode = false,
}: EstimateViewProps) {
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null)
  const [responded, setResponded] = useState(alreadyResponded)
  const [responseValue, setResponseValue] = useState<string | null>(
    estimate.client_response
  )
  const [error, setError] = useState<string | null>(null)

  const { company, project } = estimate
  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary

  async function handleRespond(response: 'accepted' | 'declined') {
    setResponding(response)
    setError(null)

    const result = await respondToEstimate(token, response)

    if (result.success) {
      setResponded(true)
      setResponseValue(response)
    } else {
      setError(result.error ?? 'Something went wrong')
    }

    setResponding(null)
  }

  return (
    <div className="space-y-8">
      {/* Header with company branding */}
      <div
        className="border-t-4 rounded-t-lg"
        style={{ borderTopColor: brandColor }}
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              {company.logo_url && (
                <Image
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  width={80}
                  height={80}
                  className="rounded-lg object-contain"
                />
              )}
              <div>
                <h1
                  className="text-2xl font-bold"
                  style={{ color: brandColor }}
                >
                  {company.name}
                </h1>
                {company.owner_name && (
                  <p className="text-sm text-muted-foreground">
                    {company.owner_name}
                  </p>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-right space-y-0.5">
              {company.phone && <p>{company.phone}</p>}
              {company.email && <p>{company.email}</p>}
              {company.website && <p>{company.website}</p>}
              {(company.address || company.city) && (
                <p>
                  {[company.address, company.city, company.state]
                    .filter(Boolean)
                    .join(', ')}
                  {company.zip ? ` ${company.zip}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Client info bar */}
      {client && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Prepared For
            </h2>
            <p className="font-medium">{client.name}</p>
            <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
              {client.email && <p>{client.email}</p>}
              {client.phone && <p>{client.phone}</p>}
              {(client.address || client.city) && (
                <p>
                  {[client.address, client.city, client.state]
                    .filter(Boolean)
                    .join(', ')}
                  {client.zip ? ` ${client.zip}` : ''}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project info */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              {project.project_type && (
                <p className="text-sm text-muted-foreground capitalize">
                  {project.project_type.replace(/_/g, ' ')}
                </p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                Estimate Date:{' '}
                {new Date(estimate.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p>Version {estimate.version}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {estimate.summary && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-2"
              style={{ color: brandColor }}
            >
              Summary
            </h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {estimate.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sections with line items */}
      {estimate.sections.map((section) => (
        <Card key={section.id}>
          <CardContent className="p-4 sm:p-6">
            <h2
              className="text-base font-semibold mb-4 pb-2 border-b-2"
              style={{ borderBottomColor: brandColor, color: brandColor }}
            >
              {section.title}
            </h2>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium text-right w-16">Qty</th>
                    <th className="pb-2 font-medium text-right w-20">Unit</th>
                    <th className="pb-2 font-medium text-right w-28">
                      Unit Price
                    </th>
                    <th className="pb-2 font-medium text-right w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={index % 2 === 0 ? 'bg-muted/30' : ''}
                    >
                      <td className="py-2 px-1">{item.description}</td>
                      <td className="py-2 px-1 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-1 text-right">
                        {item.unit ?? ''}
                      </td>
                      <td className="py-2 px-1 text-right tabular-nums">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="py-2 px-1 text-right tabular-nums font-medium">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked layout */}
            <div className="sm:hidden space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <p className="font-medium">{item.description}</p>
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <span>
                      {item.quantity} {item.unit ?? ''} x{' '}
                      {formatCurrency(item.unit_price)}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Section subtotal */}
            <div className="flex justify-end mt-4 pt-2 border-t">
              <div className="text-sm">
                <span className="text-muted-foreground mr-4">
                  Section Subtotal:
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(section.subtotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Totals block */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col items-end space-y-2">
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatCurrency(estimate.subtotal)}
                </span>
              </div>

              {estimate.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Discount
                    {estimate.discount_type === 'percentage'
                      ? ` (${estimate.discount_value}%)`
                      : ''}
                  </span>
                  <span className="text-green-600 tabular-nums">
                    -{formatCurrency(estimate.discount_amount)}
                  </span>
                </div>
              )}

              {estimate.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Tax ({estimate.tax_rate}%)
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(estimate.tax_amount)}
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t-2 border-foreground">
                <span className="text-lg font-bold">Total</span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: brandColor }}
                >
                  {formatCurrency(estimate.total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms, warranty, timeline, notes */}
      {(estimate.payment_terms ||
        estimate.warranty_terms ||
        estimate.timeline ||
        estimate.notes) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {estimate.payment_terms && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  Payment Terms
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.payment_terms}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.warranty_terms && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  Warranty
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.warranty_terms}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.timeline && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  Timeline
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.timeline}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.notes && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  Notes
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Accept / Decline buttons */}
      <Card>
        <CardContent className="p-6 sm:p-8">
          {responded ? (
            <div className="text-center space-y-2">
              {responseValue === 'accepted' ? (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                  <p className="text-lg font-semibold text-green-700">
                    Estimate Accepted
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {estimate.responded_at
                      ? `You accepted this estimate on ${new Date(
                          estimate.responded_at
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}`
                      : 'Thank you for accepting this estimate'}
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto h-12 w-12 text-red-500" />
                  <p className="text-lg font-semibold text-red-700">
                    Estimate Declined
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {estimate.responded_at
                      ? `You declined this estimate on ${new Date(
                          estimate.responded_at
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}`
                      : 'This estimate has been declined'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Please review the estimate above and accept or decline.
              </p>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button
                  size="lg"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleRespond('accepted')}
                  disabled={responding !== null}
                >
                  {responding === 'accepted' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Accept Estimate
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => handleRespond('declined')}
                  disabled={responding !== null}
                >
                  {responding === 'declined' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Decline Estimate
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      {!whiteLabelMode && (
        <div className="text-center text-xs text-muted-foreground pb-8">
          <p>
            Generated by{' '}
            <span className="font-medium">{appName}</span>
          </p>
        </div>
      )}
    </div>
  )
}
