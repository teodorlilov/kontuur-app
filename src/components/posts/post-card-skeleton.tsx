import { cn } from '@/utils/cn'

interface PostCardSkeletonProps {
  className?: string
}

export function PostCardSkeleton({ className }: PostCardSkeletonProps) {
  return (
    <div className={cn('rounded-xl border border-gray-100 bg-white p-5 animate-pulse', className)}>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-4 rounded bg-gray-200" />
        <div className="h-3 w-24 rounded bg-gray-200" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full rounded bg-gray-200" />
        <div className="h-3 w-5/6 rounded bg-gray-200" />
        <div className="h-3 w-4/6 rounded bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-200" />
        <div className="h-3 w-3/4 rounded bg-gray-200" />
      </div>
      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <div className="h-8 w-20 rounded-lg bg-gray-200" />
        <div className="h-8 w-16 rounded-lg bg-gray-200" />
        <div className="h-8 w-24 rounded-lg bg-gray-200" />
      </div>
    </div>
  )
}
