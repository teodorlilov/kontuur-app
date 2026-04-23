import { Topbar } from '@/components/layout/topbar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar title="Settings" />
      {children}
    </>
  )
}
