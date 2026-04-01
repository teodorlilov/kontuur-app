import { NotificationsBell } from './notifications-bell'

interface TopbarProps {
  title: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
      <h1 className="text-xl font-medium text-gray-900 pl-10 md:pl-0">{title}</h1>
      <NotificationsBell />
    </header>
  )
}
