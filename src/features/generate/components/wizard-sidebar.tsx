'use client'

import { LogoMark } from '@/components/ui/logo-mark'

interface SidebarItem {
  label: string
  status: 'done' | 'active' | 'idle'
}

interface WizardSidebarProps {
  items: SidebarItem[]
  footerNote: string
}

/** Dark slate left sidebar showing run context during the generate wizard. */
export function WizardSidebar({ items, footerNote }: WizardSidebarProps) {
  return (
    <div
      style={{
        width: '224px',
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <DecorativeRings />
      <SidebarContent items={items} footerNote={footerNote} />
    </div>
  )
}

function DecorativeRings() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }}
      viewBox="0 0 240 640"
      fill="none"
    >
      <ellipse cx="220" cy="320" rx="190" ry="190" stroke="rgba(236,232,225,0.025)" strokeWidth="55" />
      <ellipse cx="220" cy="320" rx="120" ry="120" stroke="rgba(192,123,85,0.04)" strokeWidth="35" />
    </svg>
  )
}

function SidebarContent({ items, footerNote }: { items: SidebarItem[]; footerNote: string }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '28px' }}>
        <LogoMark />
      </div>
      <SectionLabel text="About this run" />
      {items.map((item, i) => (
        <ContextItem key={i} item={item} />
      ))}
      <div
        style={{
          marginTop: 'auto',
          fontSize: '11px',
          color: 'rgba(236,232,225,0.25)',
          lineHeight: 1.65,
          paddingTop: '20px',
        }}
      >
        {footerNote}
      </div>
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: '9px',
        fontWeight: 500,
        color: 'rgba(236,232,225,0.35)',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        marginBottom: '10px',
      }}
    >
      {text}
    </div>
  )
}

function ContextItem({ item }: { item: SidebarItem }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '8px 0',
        borderBottom: '0.5px solid var(--sidebar-border)',
      }}
    >
      <StatusDot status={item.status} />
      <span
        style={{
          fontSize: '12px',
          fontWeight: item.status === 'active' ? 500 : 400,
          color:
            item.status === 'done'
              ? 'rgba(236,232,225,0.70)'
              : item.status === 'active'
                ? 'var(--sidebar-text-active)'
                : 'rgba(236,232,225,0.35)',
        }}
      >
        {item.label}
      </span>
    </div>
  )
}

function StatusDot({ status }: { status: SidebarItem['status'] }) {
  return (
    <div
      style={{
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        flexShrink: 0,
        background:
          status === 'done'
            ? 'var(--status-ok)'
            : status === 'active'
              ? 'var(--color-terracotta)'
              : 'rgba(236,232,225,0.20)',
      }}
    />
  )
}
