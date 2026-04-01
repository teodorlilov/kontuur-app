export default function AnalyticsLoading() {
  return (
    <div className="p-6 animate-pulse flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-24" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 h-64" />
    </div>
  )
}
