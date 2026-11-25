import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { HeroSection } from '@/components/landing/hero-section'
import { LandingFooter } from '@/components/landing/landing-footer'

vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'>) => <a {...props} data-next-link="true" />,
}))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: ComponentProps<'div'>) => <div className={className}>{children}</div> },
  useReducedMotion: () => true,
}))

it('renders native demo links in all three landing placements', () => {
  render(<>
    <HeroSection content={{ heroHeadline: 'Estimate on site', heroSubheadline: 'Job walkthroughs', ctaLabel: 'Start', heroImageUrl: null }} />
    <FinalCtaSection />
    <LandingFooter appName="Xtimator" logoUrl={null} showStoreBadge={false} />
  </>)

  const links = screen.getAllByRole('link', { name: 'See Demo' })
  expect(links.map(link => link.getAttribute('data-xt-cta-placement'))).toEqual(['hero', 'final_cta', 'footer'])
  for (const link of links) {
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/demo/entry')
    expect(link).toHaveAttribute('data-xt-cta', 'demo')
    expect(link).not.toHaveAttribute('data-next-link')
  }
  expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('data-next-link', 'true')
})
