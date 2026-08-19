/**
 * The whole-document loading state while a period pulls from Instagram: the
 * report's silhouette in hatched absence, one live pill naming the work.
 * Nothing partial is presented — the real document appears only when the
 * window's days have all been asked for.
 */
export function FillingDocument({ unfilledDays }: { unfilledDays: number }) {
  return (
    <div role="status" className="mt-6 grid gap-7">
      <div className="slot-open grid min-h-28 place-items-center rounded-panel p-4">
        <span className="flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-caption font-medium text-text2">
          <span aria-hidden="true" className="live-dot size-1.5 flex-none rounded-full bg-spring" />
          Pulling this period from Instagram — {unfilledDays} day
          {unfilledDays === 1 ? '' : 's'} still filling in…
        </span>
      </div>
      <div aria-hidden="true" className="slot-open min-h-60 rounded-panel" />
      <div aria-hidden="true" className="grid gap-7 md:grid-cols-2">
        <div className="slot-open min-h-44 rounded-panel" />
        <div className="slot-open min-h-44 rounded-panel" />
      </div>
      <div aria-hidden="true" className="slot-open min-h-36 rounded-panel" />
    </div>
  )
}
