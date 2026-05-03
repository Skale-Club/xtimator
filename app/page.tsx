import { getLandingContent } from '@/lib/platform-config'
import { LandingPage } from '@/components/landing/landing-page'

export default async function RootPage() {
  const content = await getLandingContent()
  return <LandingPage content={content} />
}
