export default function DashboardLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 h-40" />
    </div>
  )
}
