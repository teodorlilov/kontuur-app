import { cn } from '@/utils/cn'

interface ThemeRowSkeletonProps {
  className?: string
}

export function ThemeRowSkeleton({ className }: ThemeRowSkeletonProps) {
  return (
    <div className={cn('flex gap-3 items-center animate-pulse', className)}>
      <div className="h-5 w-5 rounded flex-shrink-0 bg-gray-200" />
      <div className="h-[46px] flex-1 rounded-lg bg-gray-200" />
      <div className="h-5 w-5 rounded bg-gray-200" />
    </div>
  )
}
