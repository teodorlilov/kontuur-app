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
          ? 'text-red-600 border-red-200 hover:bg-red-50'
          : hasLowQuality
            ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
            : 'text-gray-600 border-gray-200 hover:bg-gray-50'
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
