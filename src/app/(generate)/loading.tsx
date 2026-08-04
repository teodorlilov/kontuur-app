import { Card } from '@/components/ui/card'
import { Wordmark } from '@/components/layout/wordmark'

/**
 * Streams the instant navigation lands — without it the App Router holds the
 * previous page frozen for the whole server render of /generate. Geometry
 * mirrors flow-chrome and setup-view so the real screen replaces this without
 * a layout shift.
 */
export default function GenerateLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none items-center gap-6 border-b border-line bg-paper/[0.88] px-4 py-3 backdrop-blur-sm md:px-8">
        <Wordmark />
      </header>
      <div className="mx-auto grid w-full max-w-[1280px] items-start gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-6">
          <div className="skeleton h-4 w-[30%]" />
          <div className="skeleton mt-3 h-2 w-[55%]" />
          <div className="skeleton mt-8 h-10 w-[65%]" />
          <div className="skeleton mt-5 h-10 w-[65%]" />
          <div className="skeleton mt-8 h-24 w-full" />
        </Card>
        {/* The run panel's dark capsule holds its ground while its numbers load. */}
        <div className="surface-dark-capsule h-64 rounded-card bg-forest-deep" />
      </div>
    </div>
  )
}
