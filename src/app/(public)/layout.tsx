export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F4EF' }}>
      {children}
    </div>
  )
}
