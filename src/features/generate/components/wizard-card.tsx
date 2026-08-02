'use client'

interface WizardCardProps {
  title: string
  subtitle: string
  badge?: string
  maxWidth?: string
  children: React.ReactNode
}

/** Centered white card wrapper for wizard steps 1-3. */
export function WizardCard({
  title,
  subtitle,
  badge,
  maxWidth = '600px',
  children,
}: WizardCardProps) {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid rgba(15,21,18,0.10)',
          borderRadius: '16px',
          width: '100%',
          maxWidth,
          padding: '40px',
          boxShadow: '0 2px 16px rgba(15,21,18,0.06)',
        }}
      >
        <CardHeader title={title} subtitle={subtitle} badge={badge} />
        {children}
      </div>
    </div>
  )
}

function CardHeader({
  title,
  subtitle,
  badge,
}: {
  title: string
  subtitle: string
  badge?: string
}) {
  return (
    <>
      <div
        className="text-headline"
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontWeight: 400,
          color: 'var(--ink)',
          marginBottom: '6px',
        }}
      >
        {title}
      </div>
      <div
        className="text-body"
        style={{
          color: 'var(--text2)',
          lineHeight: 1.6,
          marginBottom: badge ? '8px' : '28px',
        }}
      >
        {subtitle}
      </div>
      {badge && (
        <div
          className="text-label tracking-normal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'rgba(15,21,18,0.06)',
            color: 'var(--text2)',
            marginBottom: '24px',
          }}
        >
          {badge}
        </div>
      )}
    </>
  )
}
