'use client'

import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'

interface RewriteButtonProps {
  hasLowAuthenticity: boolean
  hasLowQuality: boolean
  regenerating: boolean
  onClick: () => void
}

/** Shared rewrite button used by both generation results and review. */
export function RewriteButton({
  hasLowAuthenticity,
  hasLowQuality,
  regenerating,
  onClick,
}: RewriteButtonProps) {
  return (
    <Button
      onClick={onClick}
      loading={regenerating}
      variant="secondary"
      size="sm"
      className={cn(
        hasLowAuthenticity
          ? 'text-danger border-danger-line hover:bg-danger-bg'
          : hasLowQuality
            ? 'text-pending border-pending hover:bg-pending-bg'
            : 'text-text2 border-line hover:bg-sunken'
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
