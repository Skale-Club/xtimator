'use client'

import './tower-loader.css'
import { cn } from '@/lib/utils'

interface TowerLoaderProps {
  /** Multiplier aplicado via CSS scale. Padrão: 1.5 */
  size?: number
  /** Texto acessível para leitores de tela. Padrão: "Loading..." */
  label?: string
  className?: string
}

export function TowerLoader({ size = 1.5, label = 'Loading...', className }: TowerLoaderProps) {
  return (
    <div
      className={cn('tower-loader', className)}
      style={{ ['--tl-size' as string]: size }}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={cn('tower-loader__box', `tower-loader__box--${i}`)}>
          <div className="tower-loader__side-left" />
          <div className="tower-loader__side-right" />
          <div className="tower-loader__side-top" />
        </div>
      ))}
    </div>
  )
}
