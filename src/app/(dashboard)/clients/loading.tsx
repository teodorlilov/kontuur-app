export default function ClientsLoading() {
  return (
    <div className="p-6 animate-pulse flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 h-16" />
      ))}
    </div>
  )
}
