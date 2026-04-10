import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getEstimateByShareToken } from '@/lib/queries/share'
import { logEstimateView } from './actions'
import { EstimateView } from '@/components/share/estimate-view'

interface SharePageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { token } = await params
  const data = await getEstimateByShareToken(token)

  if (!data) {
    return { title: 'Estimate Not Found' }
  }

  return {
    title: `Estimate from ${data.estimate.company.name}`,
    description: `View estimate for ${data.estimate.project.name}`,
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params
  const data = await getEstimateByShareToken(token)

  if (!data) {
    notFound()
  }

  // Log the view event (fire-and-forget, don't block render)
  logEstimateView(token).catch(() => {
    // Silently ignore view logging failures
  })

  const alreadyResponded = !!data.estimate.client_response

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <EstimateView
        estimate={data.estimate}
        client={data.client}
        token={token}
        alreadyResponded={alreadyResponded}
      />
    </main>
  )
}
