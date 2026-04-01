export default function ReviewLoading() {
  return (
    <div className="p-6 animate-pulse flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 h-48" />
      ))}
    </div>
  )
}
