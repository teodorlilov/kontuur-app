'use client'

import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'

interface RewriteButtonProps {
  hasLowAuthenticity: boolean
  hasLowQuality: boolean
  regenerating: boolean
  onClick: () => void
  /** Both default to the compact header-row rendering the review queue uses. */
  size?: 'sm' | 'md'
  className?: string
}

/** Shared rewrite button used by both generation results and review. */
export function RewriteButton({
  hasLowAuthenticity,
  hasLowQuality,
  regenerating,
  onClick,
  size = 'sm',
  className,
}: RewriteButtonProps) {
  return (
    <Button
      onClick={onClick}
      loading={regenerating}
      variant="secondary"
      size={size}
      className={cn(
        hasLowAuthenticity
          ? 'text-danger border-danger-line hover:bg-danger-bg'
          : hasLowQuality
            ? 'text-pending border-pending hover:bg-pending-bg'
            : 'text-text2 border-line hover:bg-sunken',
        className
      )}
    >
      {regenerating
        ? 'Rewriting...'
        : hasLowAuthenticity
          ? 'Rewrite — reads as AI'
          : hasLowQuality
            ? 'Rewrite — low quality'
            : 'Rewrite to improve'}
    </Button>
  )
}
